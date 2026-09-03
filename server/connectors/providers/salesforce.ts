/**
 * Phase 14 - Salesforce CRM Connector Provider
 * 
 * Real Salesforce integration using REST API.
 * Supports:
 * - Connection testing
 * - Schema discovery (objects, fields)
 * - Inbound sync (contacts, accounts, leads)
 * - Outbound sync (update records)
 */

import type {
  ConnectorTestResult,
  ConnectorSchema,
} from "../../../shared/contracts";
import type {
  ConnectorProvider,
  ConnectorProviderInfo,
  ConnectorCredentials,
  TestConnectionRequest,
  DiscoverSchemaRequest,
  SyncRequest,
  SyncResult,
} from "./base";
import type { Logger } from "../../lib/observability";

/**
 * Salesforce configuration
 */
interface SalesforceConfig {
  apiVersion: string;
  defaultInstanceUrl: string;
}

/**
 * Salesforce OAuth token response
 */
interface SalesforceTokenResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

/**
 * Salesforce provider implementation
 */
export class SalesforceProvider implements ConnectorProvider {
  readonly info: ConnectorProviderInfo = {
    id: "salesforce",
    name: "Salesforce CRM",
    description: "Enterprise CRM platform for sales, service, and marketing",
    version: "1.0.0",
    type: "CRM",
    capabilities: {
      connectionTesting: true,
      schemaDiscovery: true,
      inboundSync: true,
      outboundSync: false,
      webhookSupport: false, // Phase 14 does not include webhooks
      batchOperations: true,
    },
    supportedObjects: ["Contact", "Account", "Lead", "Opportunity", "Case"],
    credentialFields: [
      { key: "clientId", label: "Connected App client ID", input: "text", required: true },
      { key: "clientSecret", label: "Connected App client secret", input: "secret", required: true },
      { key: "username", label: "Salesforce username", input: "text", required: true },
      { key: "password", label: "Salesforce password", input: "secret", required: true },
      { key: "securityToken", label: "Salesforce security token", input: "secret", required: true },
      {
        key: "instanceUrl",
        label: "Login URL",
        input: "url",
        required: false,
        description: "Optional Salesforce login host, such as https://test.salesforce.com.",
      },
    ],
  };

  private readonly config: SalesforceConfig;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.config = {
      apiVersion: "v59.0",
      defaultInstanceUrl: "https://login.salesforce.com",
    };
  }

  /**
   * Validate Salesforce credentials structure
   */
  validateCredentials(credentials: ConnectorCredentials): boolean {
    const required = ["clientId", "clientSecret", "username", "password", "securityToken"];
    return required.every((key) => credentials[key] && credentials[key].trim() !== "");
  }

  /**
   * Test connection to Salesforce
   */
  async testConnection(request: TestConnectionRequest): Promise<ConnectorTestResult> {
    const startTime = Date.now();

    try {
      // Validate credentials
      if (!this.validateCredentials(request.credentials)) {
        return {
          success: false,
          message: "Invalid credentials: missing required fields",
          latencyMs: Date.now() - startTime,
          diagnostics: {
            provider: "salesforce",
            error: "INVALID_CREDENTIALS",
          },
        };
      }

      // Attempt OAuth authentication
      const tokenResponse = await this.authenticate(request.credentials);

      // Test API access with a simple query
      const testResult = await this.testApiAccess(tokenResponse);

      return {
        success: testResult.success,
        message: testResult.success
          ? "Successfully connected to Salesforce"
          : testResult.message || "Connection failed",
        latencyMs: Date.now() - startTime,
        diagnostics: {
          provider: "salesforce",
          apiVersion: this.config.apiVersion,
        },
      };
    } catch {
      this.logger.error("salesforce_connection_test_failed", {
        provider: "salesforce",
        reason: "connection_error",
      });

      return {
        success: false,
        message: "Connection test failed",
        latencyMs: Date.now() - startTime,
        diagnostics: {
          provider: "salesforce",
          error: "CONNECTION_ERROR",
        },
      };
    }
  }

  /**
   * Discover Salesforce schema (objects and fields)
   */
  async discoverSchema(request: DiscoverSchemaRequest): Promise<ConnectorSchema> {
    // Authenticate
    const tokenResponse = await this.authenticate(request.credentials);
    const instanceUrl = tokenResponse.instance_url;

    // Get describe for requested objects (or defaults)
    const objectTypes = request.objectTypes || this.info.supportedObjects || [];
    const objects = [];

    for (const objectType of objectTypes) {
      try {
        const describeUrl = `${instanceUrl}/services/data/${this.config.apiVersion}/sobjects/${objectType}/describe`;
        const response = await fetch(describeUrl, {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          this.logger.warn("salesforce_describe_failed", {
            objectType,
            status: response.status,
          });
          continue;
        }

        const describe = await response.json();

        // Extract fields
        const fields = describe.fields.map((field: any) => ({
          name: field.name,
          label: field.label,
          type: field.type,
          length: field.length,
          required: !field.nillable,
          custom: field.custom,
          referenceTo: field.referenceTo || [],
        }));

        objects.push({
          name: objectType,
          label: describe.label,
          labelPlural: describe.labelPlural,
          fields,
          queryable: describe.queryable,
          createable: describe.createable,
          updateable: describe.updateable,
          deletable: describe.deletable,
        });
      } catch {
        this.logger.error("salesforce_describe_error", {
          objectType,
          reason: "provider_error",
        });
      }
    }

    return {
      entities: objects.map((object) => ({
        name: object.name,
        fields: object.fields.map((field: any) => ({
          name: String(field.name),
          type: String(field.type),
          required: field.required === true,
          description: typeof field.label === "string" ? field.label : undefined,
        })),
      })),
    };
  }

  /**
   * Sync data from Salesforce (inbound)
   */
  async syncInbound(request: SyncRequest): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncResult["errors"] = [];
    let recordsProcessed = 0;
    let recordsFailed = 0;

    try {
      // Authenticate
      const tokenResponse = await this.authenticate(request.credentials);
      const instanceUrl = tokenResponse.instance_url;

      // Build SOQL query based on mappings
      const sourceFields = request.mappings.map((m) => m.sourceField);
      const fieldList = sourceFields.join(", ");

      // Build WHERE clause for incremental sync
      let whereClause = "";
      if (request.since) {
        whereClause = `WHERE LastModifiedDate > ${request.since}`;
      }

      // Build LIMIT clause
      const limitClause = request.limit ? `LIMIT ${request.limit}` : "";

      // Execute query
      const queryUrl = `${instanceUrl}/services/data/${this.config.apiVersion}/query`;
      const soql = `SELECT ${fieldList} FROM ${request.objectType} ${whereClause} ${limitClause}`;

      this.logger.info("salesforce_query_executed", {
        objectType: request.objectType,
        soql: soql.substring(0, 200), // Log first 200 chars only
      });

      const queryResponse = await fetch(`${queryUrl}?q=${encodeURIComponent(soql)}`, {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!queryResponse.ok) {
        // Do not read or log provider response bodies: they can echo request or identity data.
        this.logger.error("salesforce_query_failed", {
          status: queryResponse.status,
          provider: "salesforce",
        });
        return {
          success: false,
          recordsProcessed: 0,
          recordsFailed: 0,
          errors: [
            {
              message: "Salesforce query failed",
              details: { status: queryResponse.status },
            },
          ],
          metadata: {},
        };
      }

      const queryResult = await queryResponse.json();
      const records = queryResult.records || [];

      // Process records
      for (const record of records) {
        try {
          // Transform record based on mappings
          const transformedRecord: Record<string, any> = {};

          for (const mapping of request.mappings) {
            const sourceValue = record[mapping.sourceField];
            transformedRecord[mapping.targetField] = this.transformValue(
              sourceValue,
              mapping.transformerType,
              {}
            );
          }

          // In a real implementation, this would save to CenterAI domain model
          // For now, we just count the record
          recordsProcessed++;
        } catch {
          recordsFailed++;
          errors.push({
            recordId: typeof record.Id === "string" ? record.Id : undefined,
            message: "Record transformation failed",
          });
        }
      }

      return {
        success: errors.length === 0,
        recordsProcessed,
        recordsFailed,
        errors,
        metadata: {
          provider: "salesforce",
          objectType: request.objectType,
          totalRecords: records.length,
          durationMs: Date.now() - startTime,
          query: soql.substring(0, 200),
        },
      };
    } catch {
      this.logger.error("salesforce_sync_inbound_failed", {
        provider: "salesforce",
        reason: "provider_error",
      });

      return {
        success: false,
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: [{ message: "Inbound sync failed" }],
        metadata: {},
      };
    }
  }

  /**
   * Sync data to Salesforce (outbound)
   */
  async syncOutbound(request: SyncRequest): Promise<SyncResult> {
    this.logger.warn("salesforce_sync_outbound_unavailable", {
      provider: "salesforce",
      objectType: request.objectType,
    });
    return {
      success: false,
      recordsProcessed: 0,
      recordsFailed: 0,
      errors: [{ message: "Outbound sync is unavailable" }],
      metadata: { provider: "salesforce", supported: false },
    };
  }

  /**
   * OAuth2 authentication with Salesforce
   */
  private async authenticate(credentials: ConnectorCredentials): Promise<SalesforceTokenResponse> {
    const requestedUrl = credentials.instanceUrl || this.config.defaultInstanceUrl;
    const loginUrl = this.requireSalesforceOrigin(requestedUrl);
    const tokenUrl = `${loginUrl}/services/oauth2/token`;

    const params = new URLSearchParams({
      grant_type: "password",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password + credentials.securityToken,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      // Never read or log OAuth response bodies. Providers may echo identity or request details.
      this.logger.error("salesforce_auth_failed", {
        provider: "salesforce",
        status: response.status,
      });
      throw new Error("Salesforce authentication failed");
    }

    const token = (await response.json()) as Partial<SalesforceTokenResponse>;
    if (typeof token.access_token !== "string" || typeof token.instance_url !== "string") {
      throw new Error("Salesforce authentication response was invalid");
    }
    token.instance_url = this.requireSalesforceOrigin(token.instance_url);
    return token as SalesforceTokenResponse;
  }

  private requireSalesforceOrigin(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("Invalid Salesforce login URL");
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      !(hostname === "salesforce.com" || hostname.endsWith(".salesforce.com"))
    ) {
      throw new Error("Invalid Salesforce login URL");
    }
    return parsed.origin;
  }

  /**
   * Test API access after authentication
   */
  private async testApiAccess(tokenResponse: SalesforceTokenResponse): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      // Simple query to test API access
      const queryUrl = `${tokenResponse.instance_url}/services/data/${this.config.apiVersion}/query?q=SELECT+Id+FROM+Account+LIMIT+1`;

      const response = await fetch(queryUrl, {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `API access test failed with status ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: "API access test failed",
      };
    }
  }

  /**
   * Transform value based on transformer type
   */
  private transformValue(
    value: any,
    transformerType?: string | null,
    _config?: Record<string, any>
  ): any {
    if (value === null || value === undefined) return null;

    switch (transformerType) {
      case "TRIM":
        return typeof value === "string" ? value.trim() : value;

      case "LOWERCASE":
        return typeof value === "string" ? value.toLowerCase() : value;

      case "UPPERCASE":
        return typeof value === "string" ? value.toUpperCase() : value;

      case "PHONE_NORMALIZATION":
        if (typeof value === "string") {
          // Remove non-numeric characters
          return value.replace(/[^\d+]/g, "");
        }
        return value;

      case "DATE_NORMALIZATION":
        if (typeof value === "string") {
          // Convert to ISO format
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date.toISOString();
        }
        return value;

      case "NUMBER_NORMALIZATION":
        if (typeof value === "string") {
          const num = parseFloat(value);
          return isNaN(num) ? null : num;
        }
        return typeof value === "number" ? value : null;

      default:
        return value;
    }
  }
}

/**
 * Phase 20 compatibility entry point.
 *
 * The original file exercised an abandoned provisioning prototype with repositories and logger
 * modules that are not part of the current application. White-label behavior now runs through the
 * authenticated workspace bootstrap, tenant-branding service, current Db contract, and live route
 * guards. Keep this entry point so historical full-regression runners execute the maintained suite.
 */

import "./white-label-verification";

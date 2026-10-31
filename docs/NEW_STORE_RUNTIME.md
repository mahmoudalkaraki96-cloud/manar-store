# New-store runtime 1.2.0

This branch is for newly provisioned stores only. Do not merge or deploy it to existing Manar/Rokon stores before migrating their implicit host/tracking configuration and legacy image sources to their own database and R2.

Business identity comes from store_settings and store_profile; tracking starts disabled and only runs on the configured public origin. New-store db/store-baseline.sql contains schema and migration markers only, with no products, categories, orders or credentials. Historical data imports are deliberately not executed for new stores.

The platform runner pins the reviewed source SHA, creates independent tenant resources, sets identity from the control database, and deploys separate storefront/admin Workers. Owner details may remain pending with provisional platform-owner access. No client password is generated.

Existing media compatibility is optional and per-store: tools/export-legacy-media.cjs prepares an R2 manifest and legacy image. This offline tooling is not imported by the runtime. No tenant receives another tenant's manifest or assets during provisioning.

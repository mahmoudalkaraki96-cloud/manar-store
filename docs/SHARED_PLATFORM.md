# Shared Store Platform

This repository is the shared source code for multiple storefronts.

## Stores

### Manar Store
- Storefront worker: `manar-store`
- Admin worker: `manar-store-admin`
- D1: `manar-store-db`
- R2: `manar-store-media`

### Rokon Home
- Storefront worker: `rokon-store`
- Admin worker: `rokon-store-admin`
- D1: `rokon-store-db`
- R2: `rokon-store-media`

## Rule

All application code is shared. Store-specific identity and Cloudflare bindings are isolated in deployment configuration and database settings. Never point Rokon workers at Manar D1/R2 resources, and never seed Rokon with sample categories or products.

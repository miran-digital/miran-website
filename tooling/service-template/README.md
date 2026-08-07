# Miran backend service template

This directory defines the canonical shape for future backend services. It is a template, not a deployed microservice.

## Canonical layout

```text
<service-name>/
├── src/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   ├── interfaces/
│   ├── config/
│   └── main.ts
├── migrations/
├── tests/
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Dependency direction

`interfaces -> application -> domain`

`infrastructure` implements ports required by the application/domain layers. Domain code must not import HTTP frameworks, databases, Redis clients, or Docker-specific concerns.

## Scaling rule

A new service should be generated from this standard when its business boundary is approved. Do not create empty services merely to mirror the roadmap.

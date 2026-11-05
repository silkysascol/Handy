# ADR-0003: MCP como interfaz principal para IAs

**Estado**: aceptada · **Fecha**: 2026-11-05

## Contexto

Queremos que Claude y otras IAs del PC usen Handy sin integraciones a medida por cada cliente.

## Decisión

Exponer el motor mediante **Model Context Protocol**: herramientas tipadas (zod), recursos (catálogos, proyecto) y prompts. Transporte stdio hoy; Streamable HTTP desde el ejecutable después. Para clientes sin MCP, el ejecutable publica la misma superficie como **OpenAPI** local.

## Consecuencias

- El esquema de cada herramienta es la documentación; se mantiene en `apps/mcp-server/src/server.ts`.
- Las operaciones destructivas exigen confirmación explícita.
- Las IAs locales (Ollama, LM Studio) se conectan vía un puente de tool calling que traduce al mismo esquema.

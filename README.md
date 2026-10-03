# 🛍️ ChangaredIA

> **Ecosistema Multi-Agente de Asistentes Autónomos para Tiendas Online y E-Commerce.**

ChangaredIA transforma la operativa de tiendas online conectando una red de asistentes de Inteligencia Artificial que trabajan de forma coordinada para resolver incidentes en tiempo real, rescatar ventas y optimizar inventarios.

---

## 🤖 Suite de Asistentes Autónomos

| Asistente | Rol Principal | Estado | Directorio Previsto |
|---|---|---|---|
| **📡 Radar Operativo** | Ingesta de webhooks 24/7, triage de incidentes (pagos, stock, envíos) y evaluación de criticidad con IA. | ✅ Listo para integrar | `assistants/radar-operativo/` |
| **💬 Concierge de Ventas** | Rescate de pagos rechazados, recuperación de carritos y atención omnicanal al cliente. | 🗓️ Planificado | `assistants/sales-concierge/` |
| **📦 Guardián de Stock** | Alerta preventiva de quiebre de stock, proyección de reposición y órdenes automáticas. | 🗓️ Planificado | `assistants/stock-sentinel/` |
| **💰 Conciliador Financiero** | Auditoría de liquidaciones, comisiones de pasarelas y control de márgenes netos. | 🗓️ Planificado | `assistants/finance-reconciler/` |

---

## 📂 Estructura del Proyecto

```
ChangaredIA/
├── assistants/                  # Directorio de micro-servicios / asistentes autónomos
│   ├── radar-operativo/         # Primer asistente (Backend Node.js/Express)
│   ├── sales-concierge/         # Próximo asistente
│   ├── stock-sentinel/          # Próximo asistente
│   └── finance-reconciler/      # Próximo asistente
├── shared/                      # Contratos de datos y esquemas de eventos comunes
│   └── contracts/
├── docs/
│   └── ARCHITECTURE.md          # Especificación técnica, diagramas y contratos
├── .gitignore
└── README.md
```

Para una descripción técnica profunda del flujo multi-agente y los contratos de eventos, consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

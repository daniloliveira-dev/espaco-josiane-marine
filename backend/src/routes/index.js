import {
  registerAppointmentRoutes,
  registerPaymentRoutes,
  registerPublicUseCaseRoutes,
  registerUserRoutes,
} from "./use-case.routes.js";
import { registerCatalogRoutes } from "./catalog.routes.js";
import { registerAppointmentQueryRoutes } from "./appointment.routes.js";
import {
  registerCashRoutes,
  registerExpenseRoutes,
  registerReportRoutes,
} from "./finance.routes.js";
import { registerHealthRoutes } from "./health.routes.js";
import {
  registerPrivateExtensionRoutes,
  registerPublicExtensionRoutes,
} from "./extension.routes.js";

export * from "./use-case.routes.js";
export * from "./catalog.routes.js";
export * from "./appointment.routes.js";
export * from "./finance.routes.js";
export * from "./health.routes.js";
export * from "./extension.routes.js";

export function registerPublicRoutes(app, dependencies) {
  registerHealthRoutes(app);
  registerPublicUseCaseRoutes(app, dependencies);
  registerPublicExtensionRoutes(app, dependencies.db, dependencies.extensionContext);
}

export function registerPrivateRoutes(app, dependencies) {
  registerUserRoutes(app, dependencies);
  registerAppointmentRoutes(app, dependencies);
  registerPaymentRoutes(app, dependencies);
  registerCatalogRoutes(app, dependencies);
  registerAppointmentQueryRoutes(app, dependencies);
  registerExpenseRoutes(app, dependencies);
  registerCashRoutes(app, dependencies);
  registerReportRoutes(app, dependencies);
  registerPrivateExtensionRoutes(app, dependencies.db, {
    admin: dependencies.admin,
    own: (req) => dependencies.ownAppointment(req),
    audit: dependencies.audit,
    queries: dependencies.queries,
  });
}

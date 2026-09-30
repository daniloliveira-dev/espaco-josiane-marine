export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Request = (
  path: string,
  method?: RequestMethod,
  body?: unknown,
) => Promise<any>;
export type AuthenticatedFetch = (path: string) => Promise<Response>;

export type ServiceInput = {
  name: string;
  description: string;
  price: number;
  duration: number;
  buffer: number;
  active: number;
};
export type ProfessionalInput = {
  name: string;
  active?: number;
  service_ids: number[];
};
export type AppointmentInput = {
  service_id: number;
  professional_id: number;
  start: string;
  notes?: string;
  user_id?: number;
};
export type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito";
export type PaymentInput = {
  appointment_id: number;
  amount: number;
  method: PaymentMethod;
  request_key: string;
};
export type ProductInput = {
  name: string;
  price: number;
  stock: number;
  minimum?: number;
  active?: number;
};

export function createApiClient(
  request: Request,
  authenticatedFetch: AuthenticatedFetch,
) {
  return {
    health: () => request("/health"),
    auth: {
      register: (input: {
        name: string;
        email: string;
        phone?: string;
        password: string;
      }) => request("/auth/register", "POST", input),
      login: (input: { email: string; password: string }) =>
        request("/auth/login", "POST", input),
      forgotPassword: (email: string) =>
        request("/auth/forgot", "POST", { email }),
      resetPassword: (token: string, password: string) =>
        request("/auth/reset", "POST", { token, password }),
    },
    users: {
      me: () => request("/me"),
      updateProfile: (input: { name: string; phone: string }) =>
        request("/me", "PUT", input),
      notifications: () => request("/notifications"),
      clients: () => request("/clients"),
      audit: () => request("/audit"),
    },
    services: {
      list: () => request("/services"),
      create: (input: ServiceInput) => request("/services", "POST", input),
      update: (id: number, input: ServiceInput) =>
        request(`/services/${id}`, "PUT", input),
    },
    professionals: {
      list: () => request("/professionals"),
      create: (input: ProfessionalInput) =>
        request("/professionals", "POST", input),
      update: (id: number, input: ProfessionalInput) =>
        request(`/professionals/${id}`, "PUT", input),
    },
    settings: {
      get: () => request("/settings"),
      update: (input: {
        open_hour: number;
        close_hour: number;
        close_time: string;
        days: number[];
        cancel_hours: number;
      }) => request("/settings", "PUT", input),
    },
    blocks: {
      list: () => request("/blocks"),
      create: (input: {
        professional_id: number | null;
        start: string;
        end: string;
        reason: string;
      }) => request("/blocks", "POST", input),
      delete: (id: number) => request(`/blocks/${id}`, "DELETE"),
    },
    availability: (input: {
      service_id: number;
      professional_id: number;
      date: string;
    }) =>
      request(
        `/availability?service_id=${input.service_id}&professional_id=${input.professional_id}&date=${encodeURIComponent(input.date)}`,
      ),
    appointments: {
      list: (date?: string) =>
        request(`/appointments${date ? `?date=${encodeURIComponent(date)}` : ""}`),
      create: (input: AppointmentInput) =>
        request("/appointments", "POST", input),
      reschedule: (id: number, start: string) =>
        request(`/appointments/${id}/reschedule`, "PATCH", { start }),
      cancel: (id: number) =>
        request(`/appointments/${id}/cancel`, "PATCH", {}),
      updateStatus: (
        id: number,
        status: "confirmado" | "em_atendimento" | "concluido" | "nao_compareceu",
      ) => request(`/appointments/${id}/status`, "PATCH", { status }),
      order: (id: number) => request(`/appointments/${id}/order`),
      addOrderItem: (
        id: number,
        input: { kind: "produto" | "servico"; item_id: number; quantity: number },
      ) => request(`/appointments/${id}/order/items`, "POST", input),
      removeOrderItem: (id: number, itemId: number) =>
        request(`/appointments/${id}/order/items/${itemId}`, "DELETE"),
      updateOrderAdjustment: (
        id: number,
        input: { discount: number; extra: number; reason: string },
      ) => request(`/appointments/${id}/order/adjustment`, "PUT", input),
    },
    payments: {
      create: (input: PaymentInput) => request("/payments", "POST", input),
    },
    expenses: {
      list: () => request("/expenses"),
      create: (input: {
        description: string;
        amount: number;
        method: PaymentMethod;
        date: string;
      }) => request("/expenses", "POST", input),
    },
    cash: {
      list: () => request("/cash"),
      open: (initial: number) => request("/cash/open", "POST", { initial }),
      close: (date: string) => request(`/cash/${date}/close`, "POST", {}),
      reconcile: (date: string, counted: number) =>
        request(`/cash/${date}/reconcile`, "POST", { counted }),
    },
    reports: {
      get: (from: string, to: string) =>
        request(`/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      export: async (from: string, to: string, format: "csv" | "pdf") => {
        const response = await authenticatedFetch(
          `/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=${format}`,
        );
        if (!response.ok) throw Error("Não foi possível exportar");
        return response.arrayBuffer();
      },
      monthly: () => request("/monthly-reports"),
      monthlyByMonth: (month: string) =>
        request(`/monthly-reports/${encodeURIComponent(month)}`),
    },
    products: {
      list: () => request("/products"),
      create: (input: ProductInput) => request("/products", "POST", input),
      update: (id: number, input: ProductInput) =>
        request(`/products/${id}`, "PUT", input),
    },
    refunds: {
      create: (input: {
        payment_id: number;
        amount: number;
        reason: string;
        request_key: string;
      }) => request("/refunds", "POST", input),
    },
    commissions: {
      rules: () => request("/commission-rules"),
      updateRule: (serviceId: number, percent: number) =>
        request(`/commission-rules/${serviceId}`, "PUT", { percent }),
      list: () => request("/commissions"),
      pay: (appointmentId: number, method: PaymentMethod) =>
        request(`/commissions/${appointmentId}/pay`, "POST", { method }),
    },
    waitlist: {
      list: () => request("/waitlist"),
      join: (input: {
        service_id: number;
        professional_id: number;
        date: string;
      }) => request("/waitlist", "POST", input),
    },
    push: {
      register: (token: string, enabled = true) =>
        request("/push/device", "POST", { token, enabled }),
      unregister: () => request("/push/device", "DELETE"),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

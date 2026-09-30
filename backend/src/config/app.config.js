export const appConfig = {
  host: "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  corsOrigins: process.env.CORS_ORIGIN?.split(",") || false,
};
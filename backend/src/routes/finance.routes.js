import { z } from "zod";
import PDFDocument from "pdfkit";
import { transaction } from "../db.js";
import { fail, localDate, now, report } from "../domain.js";

const integer = z.number().int().positive();
const money = z.number().int().min(0);
const methods = z.enum(["dinheiro", "pix", "debito", "credito"]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Data inválida",
  );

export function registerExpenseRoutes(app, { controllers, admin }) {
  app.get("/expenses", admin, async (_, res) =>
    controllers.expenses.list(res),
  );
  app.post("/expenses", admin, async (req, res) => {
    const input = z
      .object({
        description: z.string().trim().min(2).max(200),
        amount: integer,
        method: methods,
        date,
      })
      .parse(req.body);
    await controllers.expenses.create(res, req.user, input);
  });
}

export function registerCashRoutes(app, { controllers, admin }) {
  app.get("/cash", admin, async (_, res) => {
    await controllers.cash.list(res);
  });
  app.post("/cash/open", admin, async (req, res) => {
    const input = z.object({ initial: money }).parse(req.body);
    await controllers.cash.open(res, req.user, input.initial);
  });
  app.post("/cash/:date/close", admin, async (req, res) => {
    const selectedDate = date.parse(req.params.date);
    await controllers.cash.close(res, req.user, selectedDate);
  });
  app.post("/cash/:date/reconcile", admin, async (req, res) => {
    const selectedDate = date.parse(req.params.date);
    const input = z.object({ counted: money }).parse(req.body);
    await controllers.cash.reconcile(res, req.user, selectedDate, input.counted);
  });
}

export function registerReportRoutes(app, { queries, admin }) {
  app.get("/reports", admin, async (req, res) => {
    const range = z
      .object({ from: date, to: date })
      .refine((value) => value.from <= value.to)
      .parse(req.query);
    const result = await report(queries, range.from, range.to);
    if (req.query.format === "csv") {
      res.type("text/csv").attachment("relatorio.csv");
      const lines = [
        ["Indicador", "Valor (R$)"],
        ["Atendimentos concluídos", result.revenue / 100],
        ["Recebido", result.received / 100],
        ["Despesas pagas", result.expenses / 100],
        ["Resultado de caixa", result.result / 100],
        ["Pendente", result.outstanding / 100],
      ];
      return res.send("\uFEFF" + lines.map((line) => line.join(";")).join("\r\n"));
    }
    if (req.query.format === "pdf") {
      res.type("application/pdf").attachment("relatorio.pdf");
      const pdf = new PDFDocument({ margin: 50 });
      pdf.pipe(res);
      pdf.fontSize(22).text("Espaço Josiane Marine");
      pdf.fontSize(12).text(`Relatório: ${range.from} a ${range.to}`).moveDown();
      for (const [label, amount] of [
        ["Atendimentos concluídos", result.revenue],
        ["Recebido", result.received],
        ["Despesas pagas", result.expenses],
        ["Resultado de caixa", result.result],
        ["Pendente dos atendimentos", result.outstanding],
      ])
        pdf.text(
          `${label}: ${(amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        );
      pdf
        .moveDown()
        .text(
          "Faturamento: total das comandas concluídas (serviços e produtos), pela data do atendimento. Recebimentos: data do pagamento. Resultado: recebido menos despesas pagas; não representa lucro contábil.",
        );
      pdf.end();
      return;
    }
    res.json(result);
  });
}

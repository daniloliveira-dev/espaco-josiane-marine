import { fail } from "../../domain.js";

export class SchedulingService {
  constructor(schedulingRepository) {
    this.repository = schedulingRepository;
  }

  async windowFor(serviceId, professionalId, start) {
    const service = await this.repository.findBookableService(serviceId);
    if (
      !service ||
      !(await this.repository.professionalCanPerform(serviceId, professionalId))
    )
      fail("Serviço ou profissional indisponível");

    const beginsAt = new Date(start);
    if (!Number.isFinite(beginsAt.getTime()) || beginsAt <= new Date())
      fail("Escolha um horário futuro");
    const endsAt = new Date(
      beginsAt.getTime() + (service.duration + service.buffer) * 60000,
    );
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(beginsAt);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      values.weekday,
    );
    const settings = await this.repository.getSettings();
    const minute = Number(values.hour) * 60 + Number(values.minute);
    if (
      !JSON.parse(settings.days).includes(weekday) ||
      minute < settings.open_hour * 60 ||
      minute + service.duration + service.buffer > settings.close_hour * 60 ||
      Number(values.minute) % 15
    )
      fail("Fora do horário de funcionamento");

    return {
      service,
      start: beginsAt.toISOString(),
      end: endsAt.toISOString(),
    };
  }

  async assertAvailable(professionalId, start, end, exceptAppointmentId = 0) {
    if (
      await this.repository.hasConflict(
        professionalId,
        start,
        end,
        exceptAppointmentId,
      )
    )
      fail("Este horário não está mais disponível", 409);
  }

  async availability({ service_id, professional_id, date }) {
    const slots = [];
    for (let minute = 0; minute < 1440; minute += 15) {
      const start = `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00-03:00`;
      try {
        const window = await this.windowFor(service_id, professional_id, start);
        await this.assertAvailable(professional_id, window.start, window.end);
        slots.push({ start: window.start, label: start.slice(11, 16) });
      } catch (error) {
        if (!error.status) throw error;
      }
    }
    return slots;
  }
}
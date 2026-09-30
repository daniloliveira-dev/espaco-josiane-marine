export class AppointmentController {
    constructor({ appointmentUseCases, appointmentService }) {
        this.useCases = appointmentUseCases;
        this.service = appointmentService;
    }

    async availability(res, input) {
        return res.json(await this.service.availability(input));
    }

    async list(res, user, range) {
        return res.json(await this.service.list(user, range));
    }

    async create(res, user, input) {
        return res.status(201).json(await this.useCases.createAppointment.execute(user, input));
    }

    async reschedule(res, user, appointmentId, start) {
        return res.json(
            await this.useCases.rescheduleAppointment.execute(user, appointmentId, start),
        );
    }

    async cancel(res, user, appointmentId) {
        return res.json(await this.useCases.cancelAppointment.execute(user, appointmentId));
    }

    async updateStatus(res, user, appointmentId, status) {
        return res.json(await this.service.updateStatus(user, appointmentId, status));
    }
}
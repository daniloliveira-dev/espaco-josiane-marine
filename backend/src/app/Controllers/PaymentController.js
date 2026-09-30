export class PaymentController {

    constructor(useCases) {
        this.useCases = useCases;
    }

    async create(res, user, input) {
        return res.status(201).json(await this.useCases.recordPayment.execute(user, input));
    }
}
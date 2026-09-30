export class UserController {
    constructor(useCases) {
        this.useCases = useCases;
    }

    async register(res, input) {
        return res.status(201).json(await this.useCases.registerUser.execute(input));
    }

    async login(res, input) {
        return res.json(await this.useCases.loginUser.execute(input));
    }

    authenticate(token) {
        return this.useCases.authenticateUser.execute(token);
    }

    async updateProfile(res, user, input) {
        return res.json(await this.useCases.updateUserProfile.execute(user, input));
    }

    async listNotifications(res, userId) {
        return res.json(await this.useCases.listNotifications.execute(userId));
    }

    async listClients(res) {
        return res.json(await this.useCases.listClients.execute());
    }

    async listAuditEntries(res) {
        return res.json(await this.useCases.listAuditEntries.execute());
    }
}
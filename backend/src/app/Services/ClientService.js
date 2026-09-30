export class ClientService {
  constructor(clientRepository) {
    this.repository = clientRepository;
  }

  list() {
    return this.repository.list();
  }
}
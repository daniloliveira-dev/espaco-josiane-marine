# Validação desta entrega

- Testes automatizados da API: autenticação/perfis, isolamento, concorrência, disponibilidade, histórico de preços, caixa, pagamento parcial, idempotência, comanda, estoque, comissão, estorno, recuperação de senha, jobs e exportações.
- TypeScript e ESLint do mobile.
- Exportação de bundles Expo para Android, iOS e Web (não são binários assinados).
- Teste de interface a 390×844: login cliente, escolha serviço/profissional/data, consulta disponibilidade, confirmação da reserva, visualização do próprio agendamento, logout, login ADM e dashboard. Sem erros de JavaScript nesse fluxo.
- Capturas em `previews/` usam dados demonstrativos temporários; não há contas demonstrativas na base real.
- Expo Doctor: verificações locais de dependências resolvidas; verificações remotas de schema/metadados indisponíveis por falha de rede no ambiente.
- Não testados em dispositivo físico: binário nativo, permissão/entrega push e compartilhamento nativo.
- SMTP e push dependem de credenciais externas; não houve envio de mensagens reais nesta validação.

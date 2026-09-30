# Arquitetura do backend

O backend segue uma organização inspirada no Laravel, adaptada ao Express e ao MySQL:

- `src/app/Controllers`: recebe a chamada HTTP, invoca o caso de uso e traduz o resultado para a resposta HTTP. Não contém regras de negócio.
- `src/app/UseCases/<Área>`: casos de uso com método central `execute`, onde ficam as regras e orquestração da aplicação.
- `src/app/Services`: serviços transversais e regras reutilizáveis; delegam persistência aos repositórios e retornam seus resultados.
- `src/app/Repositories`: concentra o SQL operacional no `QueryRepository`; os repositórios de domínio delegam a ele sem executar consultas próprias. Métodos retornam linhas/coleções ou resultados do banco.
- `src/app/Models`: representação das entidades persistidas, como `User`.
- `src/app/DTO`: projeções explícitas entre API e aplicação, sem expor campos internos.
- `src/routes`: módulos de rotas por domínio; `index.js` exporta e registra os grupos públicos e autenticados.
- `src/config`: configuração de infraestrutura da aplicação (porta, host e CORS).
- `src/container.js`: composition root e injeção das dependências.
- `src/db.js`: conexão, schema e transações.

O DDL de criação das tabelas permanece em `src/db.js` como bootstrap da
infraestrutura; consultas e gravações de runtime passam por `QueryRepository`.

## Criar administrador do aplicativo

O comando administrativo é uma operação de terminal, não uma rota HTTP, e não
é exposto pelo mobile. Com o serviço `api` ativo, execute na raiz do projeto:

`docker compose exec -it api npm run admin:create -- "Nome" "email@exemplo.com"`

O terminal solicita a senha sem exibi-la e pede confirmação. A senha precisa
ter pelo menos 10 caracteres. O usuário criado recebe `role='admin'`.

## Fluxos migrados

Autenticação/sessão, perfil, listagem de clientes, auditoria, notificações,
disponibilidade, criação/reagendamento/cancelamento de agendamentos e registro
de pagamentos usam os diretórios acima. `createApp(db, secret)` continua
compatível com o servidor e os testes atuais.

## Rotas

Todas as definições de endpoints estão em `src/routes/*`; `src/routes/index.js`
reexporta os módulos e fornece `registerPublicRoutes` e `registerPrivateRoutes`
como pontos de entrada. `src/app.js` limita-se a compor middleware,
autenticação, tratamento de erros e o registro centralizado.

Algumas rotas ainda contêm SQL e regras de negócio diretamente nos módulos de
rota; movê-las para Controllers/UseCases/Services/Repositories é uma etapa
separada. Os módulos de rotas atuais preservam os contratos e transações da API.

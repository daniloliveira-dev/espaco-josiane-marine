# Espaço Josiane Marine

Aplicativo Android/iOS em **React Native + Expo 57 + TypeScript**, com API **Node.js 24 + Express 5** e banco **SQLite persistente**. Tema preto/grafite/malva e logo fornecida pelo salão.

## O que está funcional

- Cadastro, login, sessão nativa em armazenamento seguro, edição de perfil e recuperação de senha por SMTP.
- Dois perfis: administrador e cliente. O cliente agenda apenas para si e vê apenas seus registros; autorização é verificada na API.
- Serviços, preços, duração, intervalo de preparação, profissionais e serviços habilitados.
- Horário de funcionamento, dias da semana, bloqueios gerais/individuais, folgas e antecedência para cancelamento/reagendamento.
- Consulta de disponibilidade em intervalos de 15 minutos, reserva atômica, cancelamento e reagendamento, histórico e estados de atendimento.
- Comanda com serviços adicionais pela mesma profissional, produtos, descontos/acréscimos com justificativa e pagamento parcial/sinal.
- Recebimentos em dinheiro/Pix/débito/crédito, chave contra duplicação, estornos parciais e auditoria das operações financeiras.
- Estoque básico com baixa ao adicionar produto à comanda, devolução ao remover/cancelar e alerta de estoque baixo.
- Comissão percentual por serviço, calculada sobre o valor após desconto proporcional; pagamento gera despesa uma única vez.
- Despesas pagas, abertura de caixa, fechamento manual/automático, contagem física e diferença. Fechamentos conferidos não são reeditados.
- Dashboard diário; relatório por período em PDF/CSV; snapshots mensais automáticos, disponíveis no app.
- Avisos dentro do aplicativo, lembrete uma hora antes, lista de espera e infraestrutura push Expo com filas e recibos (ativação requer credenciais).

## Execução no Windows / VS Code

Instale Node.js **24 LTS**. Extraia este pacote e abra a pasta no VS Code.

### 1. API — primeiro terminal PowerShell

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Edite `.env`: gere um segredo e coloque-o em `JWT_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Crie o administrador real e inicie a API:

```powershell
npm run admin -- "Josiane Marine" "seu-email@exemplo.com" "SuaSenhaForteAqui"
npm run dev
```

O cadastro público nunca cria administrador. A senha passada no comando pode ficar no histórico do terminal; use uma senha inicial e proteja o acesso ao computador. A base é criada automaticamente em `backend/data/salon.sqlite`. Sem dados fictícios na base real.

### 2. Mobile — segundo terminal

```powershell
cd mobile
npm ci
Copy-Item .env.example .env
```

Edite `EXPO_PUBLIC_API_URL`:

- Celular físico: `http://IP_DO_COMPUTADOR:3000` (mesma rede Wi-Fi).
- Emulador Android padrão: `http://10.0.2.2:3000`.
- Navegador no computador: `http://localhost:3000`.

Descubra o IP com `ipconfig`; permita a porta 3000 no firewall apenas para a rede de desenvolvimento. Reinicie o Expo após mudar `.env`.

```powershell
npm start
```

Para começar pelo navegador:

```powershell
npm run web
```

Nesse caso configure `CORS_ORIGIN` na API para a origem exibida pelo Expo (normalmente `http://localhost:8081`). No celular, use um development build com os módulos nativos do projeto; push não foi testado no Expo Go.

### 3. Configurar o salão

Entre como ADM. Em **Gestão**, cadastre serviços e profissionais habilitados; configure os horários. Clientes podem criar suas próprias contas e reservar. Em **Caixa**, abra o caixa antes de receber ou pagar dinheiro. Na **Agenda**, inicie/conclua atendimentos, abra comandas e registre recebimentos. **Relatórios** contém PDF/CSV e os meses gerados pelo servidor.

## Demonstração isolada

No PowerShell, antes de executar a API:

```powershell
$env:DATABASE_PATH="./data/demo.sqlite"
npm run demo
npm run dev
```

ADM: `admin@demo.local`; cliente: `cliente@demo.local`; senha de ambos: `DemoJosiane123!`. Esses dados são apenas demonstração. Para voltar ao banco real, encerre o processo e execute `Remove-Item Env:DATABASE_PATH` antes de iniciar novamente.

## Android APK e iOS

O pacote contém **código-fonte**, não um APK/IPA assinado. Configure sua conta Expo e seu projeto EAS:

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Configure `EXPO_PUBLIC_API_URL` como variável do ambiente EAS usado no build, apontando para a API hospedada em HTTPS. Confira identificadores `com.josianemarine.salao` em `app.json` antes da primeira publicação.

```powershell
# APK Android para instalação/teste
npx eas-cli@latest build --platform android --profile preview
# Build de desenvolvimento
npx eas-cli@latest build --platform android --profile development
# iOS para distribuição
npx eas-cli@latest build --platform ios --profile production
```

Assinatura e publicação exigem contas/credenciais da Apple e Google conforme a distribuição escolhida. Os builds nativos precisam de teste em aparelhos reais. Bundles JS Android/iOS/Web, TypeScript e lint foram validados nesta entrega; isso não substitui compilação, assinatura ou teste do binário nativo.

## Integrações externas

**SMTP:** preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` no backend. Sem configuração, recuperação informa indisponibilidade. Não há senha ou token de reset exposto pela API.

**Push:** configure EAS `projectId` e credenciais FCM/APNs do projeto. No backend, defina `PUSH_ENABLED=true` e, se a segurança push estiver ativada na conta Expo, `EXPO_ACCESS_TOKEN`. O cliente pode ativar/desativar em Meu perfil. Envio externo e entrega em aparelhos não foram testados sem essas credenciais. O servidor consulta recibos e desabilita tokens não registrados; retentativas de rede não garantem entrega exatamente uma vez.

**Pix/cartões:** registro manual de recebimentos e estornos; não há cobrança automática ou integração bancária. Registre somente valores que efetivamente recebeu e faça devoluções também no banco/adquirente. WhatsApp não está integrado.

## Servidor e dados

A API precisa permanecer ligada para os trabalhos agendados. A cada minuto fecha caixas vencidos, prepara o mês anterior e cria lembretes; na reinicialização recupera caixas ainda abertos. A geração mensal cria um snapshot do mês anterior uma vez; pagamentos posteriores são vistos no relatório atualizado por período. Fechamento automático espera a conferência física.

Docker opcional:

```sh
docker compose up --build -d
docker compose exec api npm run admin -- "Josiane" "email@exemplo.com" "SenhaForteInicial"
```

Use HTTPS/reverse proxy e configuração correta de proxy/rate limit antes de produção. Esta arquitetura SQLite usa uma instância do backend e volume persistente; para múltiplas instâncias, migre o armazenamento para PostgreSQL e a execução de jobs para um worker único. Faça backup consistente do SQLite, incluindo WAL quando aplicável, ou utilize a API de backup do SQLite. Não copie só o arquivo principal com gravações em andamento.

## Regras financeiras

- Valores inteiros em centavos; moeda BRL; fuso America/Sao_Paulo.
- Faturamento: total final das **comandas concluídas**, incluindo produtos, descontos e acréscimos, pela data do atendimento.
- Recebimentos: pagamentos menos estornos pela data de cada lançamento.
- Resultado de caixa: recebimentos líquidos menos despesas pagas; não representa lucro contábil.
- Pendente: saldo atual dos atendimentos do período, considerando todos os pagamentos e estornos.
- Comissão: apenas serviços, desconto distribuído proporcionalmente entre os itens; regras são copiadas ao inserir o serviço, preservando histórico.
- Pix/cartões não aumentam o saldo físico. Fechamento guarda dinheiro esperado; conferência registra dinheiro contado.
- O relatório mensal é snapshot; o relatório por período é atualizado e pode refletir pagamentos posteriores no saldo pendente.

## Limites desta versão

Não estão implementados pacotes, cupons automáticos, fidelidade, taxas/parcelas de adquirentes, comissão fixa, recursos compartilhados (cadeiras/salas), equipe com perfis adicionais, comanda com profissionais diferentes, remoção de serviços adicionados, sangria com natureza própria, cadastro manual de cliente pelo ADM ou agenda visual semanal/mensal. A agenda atual é uma lista filtrável por dia; os períodos financeiros são selecionáveis. A lista de espera é para acompanhamento do ADM, sem reserva automática ou promessa de vaga. Autorização de encaixe não permite sobrepor reservas.

A autenticação via e-mail tem recuperação por SMTP; não inclui verificação de e-mail, login social, MFA ou refresh tokens. Sessão expira em 12 horas. O piloto deve ser testado com a rotina real do salão antes de uso operacional.

## Testes

```sh
cd backend
npm test
cd ../mobile
npm run typecheck
npm run lint
npx expo export --platform all
```

Testes cobrem permissão ADM/cliente, isolamento entre clientes, reservas concorrentes, duração, preço histórico, cancelamento, sinais e idempotência, caixa físico, fechamento automático, comanda, estoque, descontos, comissão, estorno, uso único de reset de senha e geração mensal sem duplicação.

## Estrutura

- `backend/src/db.js`: schema idempotente e versão do banco.
- `backend/src/app.js`: API, autenticação, autorização e agenda.
- `backend/src/extensions.js`: comanda, produtos, comissões, estornos e recuperação.
- `backend/src/jobs.js`: trabalhos agendados e push.
- `backend/test/`: testes de integração com base isolada em memória.
- `mobile/src/app/`: telas e navegação Expo Router.
- `mobile/src/core.tsx`: sessão, requisições e formatação.
- `mobile/src/components/`: componentes e identidade visual.

Documentação oficial: https://docs.expo.dev/versions/v57.0.0/ e https://docs.expo.dev/build/introduction/.

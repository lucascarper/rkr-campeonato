# RKR Kart Racing · Sistema de Campeonato

Classificação, dashboard e janela do piloto do campeonato de Kart Rental RKR, alimentados por planilhas
enviadas no painel administrativo. Especificação completa em [docs/documentacao-base.md](docs/documentacao-base.md).

```text
apps/
├─ api/            Django + DRF (Python 3.13)
│  ├─ rules/         pontuação, descarte, desempate e estatísticas — Python puro, sem Django
│  ├─ imports/       leitura e validação de planilhas (formato da organização e CSV longo)
│  ├─ championship/  models, API pública e administrativa, fotos, recálculo
│  └─ tests/         pytest (53 testes, incluindo conferência com a planilha oficial)
└─ web/            Next.js 16 (App Router) + Tailwind 4 + Radix + Motion + ECharts + TanStack Table
docs/
├─ documentacao-base.md
├─ decisoes.md       regras confirmadas com a organização
├─ exemplos/         planilha real da Etapa 8 (usada nos testes)
└─ marca/            logo original recebida
```

## Rodar localmente

Pré-requisitos: Python 3.12+ e Node 20.9+. Sem `DATABASE_URL`, a api usa SQLite; sem `S3_BUCKET`, as fotos
ficam em `apps/api/media/`.

```bash
cd apps/api && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```

```bash
cd apps/api && DJANGO_DEBUG=true .venv/bin/python manage.py migrate && DJANGO_DEBUG=true .venv/bin/python manage.py bootstrap
```

```bash
cd apps/api && DJANGO_DEBUG=true .venv/bin/python manage.py import_results ../../docs/exemplos/rkr-2026-etapa-8.xlsx
```

```bash
cd apps/api && DJANGO_DEBUG=true .venv/bin/python manage.py createsuperuser
```

```bash
cd apps/api && DJANGO_DEBUG=true .venv/bin/python manage.py runserver 127.0.0.1:8000
```

Em outro terminal:

```bash
cd apps/web && npm install && npm run dev
```

Site em http://localhost:3000 · painel em http://localhost:3000/admin.

## Testes

```bash
cd apps/api && .venv/bin/pytest -q
```

```bash
cd apps/web && npm run lint && npm run typecheck && npm test
```

Testes de interface (Playwright) usam a api com a planilha de exemplo importada:

```bash
cd apps/web && npx playwright install chromium && npm run build && npm run test:e2e
```

## Como a importação funciona

1. **Importar resultados** no painel → envie o `.xlsx` da organização (o mesmo arquivo que já é usado hoje:
   aba "Etapas 2026" em blocos + abas RK1/RK2/RK3) ou um `.csv` no formato longo da documentação.
2. A pré-visualização mostra erros por linha e coluna, corridas novas, substituídas e sem alteração, a tabela
   de pontos identificada em cada corrida (Padrão ou Endurance) e a **conferência com as abas RK1/RK2/RK3**.
3. Nomes parecidos com pilotos já cadastrados exigem decisão (é o mesmo piloto ou é novo).
4. **Confirmar e gravar** grava tudo em uma transação, recalcula a classificação e avisa o site para
   atualizar na hora. Toda importação fica no histórico e pode ser desfeita.

Reenviar a planilha acumulada (Etapa 8, depois Etapa 9…) é o fluxo esperado: corridas iguais são ignoradas
e só as novas ou alteradas são gravadas.

## Deploy na Railway

Um projeto com os serviços **web** (`apps/web`), **api** (`apps/api`), **Postgres** e um **bucket**.
Cada pasta tem seu `railway.json` (build, start e healthcheck). A api roda `python manage.py release`
(migrações, carga inicial e recálculo) no próprio comando de start, antes do gunicorn: não depende do
pré-deploy da Railway, que não estava sendo executado.
Em cada serviço, em **Settings**, configure:

| Serviço | Root Directory | Config-as-code (Railway Config File) |
| --- | --- | --- |
| api | `/apps/api` | `/apps/api/railway.json` |
| web | `/apps/web` | `/apps/web/railway.json` |

O caminho do arquivo de configuração **não segue o Root Directory**: sem ele, a Railway ignora o
`railway.json` e a api sobe sem migrar o banco (`relation ... does not exist`). O `release` é seguro a
cada início: migrações já aplicadas são ignoradas e a carga inicial não duplica dados.

| Serviço | Variável | Valor |
| --- | --- | --- |
| web | `API_INTERNAL_URL` | `http://${{<serviço-api>.RAILWAY_PRIVATE_DOMAIN}}:${{<serviço-api>.PORT}}` |
| web | `NEXT_PUBLIC_SITE_URL` | URL pública, ex.: `https://rkr.com.br` |
| web | `REVALIDATE_SECRET` | segredo longo e aleatório (o mesmo da api) |
| web | `NEXT_PUBLIC_PHOTO_HOST` | domínio público do bucket (opcional) |
| api | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| api | `DJANGO_SECRET_KEY` | chave longa e aleatória |
| api | `DJANGO_ALLOWED_HOSTS` | opcional: domínios extras. O endereço privado da api (`RAILWAY_PRIVATE_DOMAIN`), o healthcheck da Railway e os domínios de `CSRF_TRUSTED_ORIGINS` já entram automaticamente |
| api | `CSRF_TRUSTED_ORIGINS` | `https://rkr.com.br` |
| api | `DJANGO_SUPERUSER_USERNAME` / `DJANGO_SUPERUSER_PASSWORD` | primeiro administrador (senha com 12+ caracteres) |
| api | `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_DOMAIN` | bucket de fotos (ver abaixo) |
| api | `PORT` | `8000` (defina explicitamente, para o web conseguir referenciar) |
| api | `WEB_REVALIDATE_URL` | `http://${{<serviço-web>.RAILWAY_PRIVATE_DOMAIN}}:${{<serviço-web>.PORT}}/revalidate` |
| web | `PORT` | `3000` (defina explicitamente, para a api conseguir referenciar) |
| api | `REVALIDATE_SECRET` | o mesmo do web |
| api | `SENTRY_DSN` | opcional |

`<serviço-api>` e `<serviço-web>` são os **nomes exatos dos serviços** no painel da Railway (ex.: `rkr-campeonato-api`).
Se o nome não bater, ou se `PORT` não estiver definida no serviço referenciado, a referência vira vazia e
o build do web falha com "API_INTERNAL_URL inválida". Como as rotas `/api` são gravadas no build, qualquer
mudança em `API_INTERNAL_URL` exige um novo deploy do web.

**Bucket:** copie nome, endpoint, chave de acesso, chave secreta e região das credenciais do bucket.
`S3_ENDPOINT` é obrigatório fora da AWS (bucket da Railway, Cloudflare R2, etc.): sem ele as chaves vão
para a AWS e o erro é `InvalidAccessKeyId`. Para testar, rode no shell da api:
`python manage.py check_storage`. Uma falha no bucket não impede a importação de planilhas (vira aviso),
mas impede o envio de fotos.

A api não precisa de domínio público: o navegador fala só com o web, que repassa `/api/*` e `/media/*`
pela rede privada (mesma origem, sem CORS, cookie de sessão seguro).

## Onde guardar as imagens

| Imagem | Onde fica | Por quê |
| --- | --- | --- |
| **Logo e símbolo** | `apps/web/public/brand/logo.png` e `r-mark.png` (versionados no Git) | Servidos pelo próprio Next com cache de CDN; mudam raramente. Favicon em `apps/web/app/icon.png` e `apple-icon.png`. |
| **Fotos dos pilotos** | **Bucket S3** (variáveis `S3_*` na api), enviadas pelo painel em Pilotos → Enviar foto | Ficam fora do contêiner (que é apagado a cada deploy). O site as entrega em `/media/drivers/...` (a api lê do bucket, que pode ser privado); com `S3_PUBLIC_DOMAIN`, o navegador busca direto no CDN. |
| Planilhas importadas | Mesmo storage das fotos, pasta `imports/` | Auditoria de cada importação. |

Não coloque fotos de pilotos em `public/` nem no repositório: elas mudam ao longo do ano, dependem de
autorização de uso e deixariam o deploy pesado. Envie sempre pelo painel. O sistema, via Pillow:

- aceita JPG, PNG ou WebP até 5 MB (de preferência retrato, 3:4, com o rosto no terço superior);
- gera uma **miniatura 160×160** (tabela) e uma **versão 900×1200** (janela do piloto), em **WebP**;
- nomeia os arquivos com um hash (`drivers/<slug>/<hash>-thumb.webp`), então o bucket pode servir com
  `Cache-Control: public, max-age=31536000, immutable`. Foto nova gera URL nova, sem cache velho.

Buckets da Railway são privados: as fotos passam pela api (`/media/drivers/...`), com cache de 1 ano no
navegador. Só fotos de pilotos são servidas por essa rota; as planilhas guardadas no bucket nunca ficam
acessíveis. Se no futuro houver um domínio/CDN público na frente do bucket (ex.: `fotos.rkr.com.br`),
informe-o em `S3_PUBLIC_DOMAIN` (api) e `NEXT_PUBLIC_PHOTO_HOST` (web) para o navegador buscar direto nele. Sem bucket, é possível usar um **volume da
Railway** montado em `/data` com `MEDIA_ROOT=/data/media`; funciona, mas as fotos passam pelo Django.

A logo recebida é um JPEG de 664×163 px com fundo preto. O sistema usa uma versão com fundo removido
automaticamente. Quando a organização tiver o **SVG** (ou PNG transparente em alta resolução), substitua
`apps/web/public/brand/logo.png` e `r-mark.png` mantendo os nomes.

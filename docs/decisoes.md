# Decisões e regras confirmadas (20/09/2026)

Respostas às pendências da documentação base, confirmadas com a organização ou extraídas da planilha
oficial `RKR 2026 Classificação - Etapa 8.xlsx`. Todas são editáveis no painel em **Regras**.

| Pendência | Decisão |
| --- | --- |
| Tabela de pontos | **Padrão:** 25, 20, 18, 15, 12, 10, 8, 6, 4, 3, 2, 1 (1º ao 12º). **Endurance (E7):** 35, 30, 25, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3 (1º ao 13º). O importador identifica a tabela de cada corrida pelos pontos da coluna "Corrida". |
| Bônus | Pole **+1**. Volta mais rápida **+2 só para quem termina do 4º lugar para trás** (no pódio não pontua). Camiseta **−1**. DSQ/DNS = 0. DNF = 0. |
| Corridas por etapa | Pré-temporada (E1–E3): 3 baterias (A/B/C) com categorias misturadas; cada piloto corre uma. A partir da E4: uma final por categoria. Pontos por corrida. |
| Pré-temporada | Os pontos de E1–E3 **somam na categoria final do piloto** (categoria da aba RK1/RK2/RK3). |
| Descartes | **2** piores resultados, somente na visão "Com descarte" da janela do piloto. **Etapas em que o piloto faltou também podem ser descartadas** (contam como 0 ponto), assim como DNS. Isso substitui a regra da documentação base ("ausência não é descartada"); é configurável em Regras → "Faltas podem ser descartadas". Decidido em 21/09/2026. |
| Desempate | Pontos → mais vitórias → mais 2º lugares → 3º… (contagem regressiva) → mais poles → mais VRs. Empate total: mesma posição. |
| Pódio | Do **1º ao 5º** lugar de cada etapa (vale para a coluna "Pód", a janela do piloto e o dashboard). Configurável em Regras → "Pódio até a posição". Decidido em 21/09/2026. O bônus de VR continua valendo do 4º lugar em diante, como na planilha oficial. |
| Consistência | Top **5**, mínimo de 50% das corridas. |
| Colunas da planilha | Posição, piloto, pontos da posição, pole, VR, camiseta e observações (penalizações/DQ). **Não há** largada nem tempo de volta: "ganho de posições" e "melhor volta" ficam ocultos. |
| Troca de categoria | Resultados guardam a categoria da corrida; a pré-temporada vai para a categoria atual do piloto (editável em Pilotos). |

**Conferência:** com essas regras, os totais e as posições das 67 linhas das abas RK1, RK2 e RK3 da planilha
oficial batem exatamente com o sistema (teste automatizado `tests/test_import_flow.py`).

**Ainda em aberto:** domínio do site, número de administradores, logo em SVG e fotos dos pilotos com autorização.

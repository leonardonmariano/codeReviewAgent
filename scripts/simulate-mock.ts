import { parseReview, verdictToEmoji } from '../src/parser';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const MOCK_REVIEW = `## 📋 Resumo
Este PR adiciona lógica de retry com backoff exponencial ao \`PaymentService\`, resolvendo falhas silenciosas de pagamento causadas por timeouts no gateway. A implementação é bem estruturada, com separação clara de responsabilidades e testes cobrindo os cenários principais.

## ✅ Pontos Positivos
- Excelente separação de responsabilidades: \`withRetry\` é genérico e reutilizável, enquanto \`isNonRetryable\` encapsula a lógica de domínio de pagamentos
- Testes unitários cobrem os 4 cenários críticos: sucesso, retry em falha transiente, esgotamento de tentativas e bypass de retry
- \`RetryExhaustedError\` preserva o \`lastError\` original, facilitando o diagnóstico em produção
- O uso de \`Math.pow(2, attempt - 1)\` para backoff é correto e evita sobrecarga no gateway

## 🚨 Problemas Críticos
- A lista \`NON_RETRYABLE\` em \`isNonRetryable\` usa \`err.message.includes(code)\` — isso depende do formato da mensagem de erro do gateway, que pode mudar sem aviso. Se o gateway alterar o texto da mensagem, pagamentos recusados serão retentados 3x desnecessariamente, gerando cobranças duplicadas. Use códigos de erro estruturados em vez de strings.

## ⚠️ Melhorias Sugeridas
- Adicionar jitter ao delay (\`delay * (0.8 + Math.random() * 0.4)\`) para evitar thundering herd quando múltiplos pagamentos falham simultaneamente
- O timeout máximo de retry pode chegar a 500 + 1000 + 2000 = 3.5s — considere expor \`maxDelayMs\` como opção para limitar em cenários de alta latência
- \`RetryExhaustedError\` não é lançado atualmente — o loop lança \`lastError\` diretamente na última tentativa. A classe existe mas nunca é usada
- Logar tentativas de retry com nível \`warn\` para observabilidade em produção

## 💡 Sugestões com Código
\`\`\`typescript
// Use códigos estruturados em vez de string matching
const NON_RETRYABLE_CODES = new Set([
  'card_declined',
  'invalid_cvv',
  'expired_card',
  'insufficient_funds',
]);

function isNonRetryable(err: unknown): boolean {
  if (err instanceof GatewayError) {
    return NON_RETRYABLE_CODES.has(err.code);
  }
  return false;
}
\`\`\`

\`\`\`typescript
// Adicionar jitter para evitar thundering herd
const jitter = 0.8 + Math.random() * 0.4; // 80%–120%
const delay = baseDelayMs * Math.pow(2, attempt - 1) * jitter;
\`\`\`

## 🔒 Segurança
- **SQL Injection:** ✅ Não aplicável
- **XSS / HTML Injection:** ✅ Não aplicável
- **Secrets/credentials exposed:** ✅ Nenhuma credencial no diff
- **Input validation:** ⚠️ \`isNonRetryable\` usa string matching frágil (ver Problemas Críticos)
- **Authentication/Authorization:** ✅ Não alterado neste PR
- **Sensitive data em logs:** ✅ Nenhum dado sensível logado
- **Vulnerabilidades de dependências:** ✅ Nenhuma nova dependência adicionada

## 📊 Avaliação Final
**Score:** 7/10
**Veredicto:** APPROVED_WITH_SUGGESTIONS

Boa implementação que resolve um problema real de produção. O único bloqueio é a detecção de erros não-retentáveis por string matching — isso precisa ser refatorado antes de ir para produção para evitar cobranças duplicadas em cartões recusados. As demais sugestões são melhorias não-bloqueantes.

## 🔍 Comentários Inline
\`\`\`json
[
  {"path": "src/services/payment.service.ts", "line": 18, "body": "⚠️ \`err.message.includes(code)\` é frágil — se o gateway mudar o texto da mensagem, cartões recusados serão retentados. Use \`err instanceof GatewayError && NON_RETRYABLE_CODES.has(err.code)\` no lugar."},
  {"path": "src/utils/retry.ts", "line": 38, "body": "Este throw nunca alcança \`RetryExhaustedError\` — a exceção original é relançada no loop acima. Ou remova a classe ou ajuste o fluxo para lançá-la aqui."}
]
\`\`\``;

function divider(char = '─', width = 72): string {
  return c.gray + char.repeat(width) + c.reset;
}

function scoreBar(score: number): string {
  const filled = Math.round(score);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = score >= 8 ? c.green : score >= 5 ? c.yellow : c.red;
  return `${color}${bar}${c.reset} ${c.bold}${score}/10${c.reset}`;
}

function verdictColor(verdict: string): string {
  if (verdict === 'APPROVED') return c.green;
  if (verdict === 'CHANGES_REQUESTED') return c.red;
  return c.yellow;
}

function main(): void {
  const result = parseReview(MOCK_REVIEW, 31400);

  console.clear();
  console.log('\n' + divider('═'));
  console.log(`${c.bold}${c.magenta}  🤖  PR Review Bot${c.reset}${c.dim}  — local simulation${c.reset}`);
  console.log(divider('═'));
  console.log(`${c.dim}  Repo   ${c.reset}${c.cyan}acme-corp/payments-api${c.reset}`);
  console.log(`${c.dim}  PR     ${c.reset}${c.bold}#87${c.reset} feat: add payment retry logic with exponential backoff`);
  console.log(`${c.dim}  Branch ${c.reset}${c.yellow}feat/payment-retry${c.reset}${c.dim} → ${c.reset}main`);
  console.log(`${c.dim}  Author ${c.reset}maria-santos   ${c.dim}Files ${c.reset}3`);
  console.log(divider('─'));

  console.log('\n' + divider('═'));
  console.log(`${c.bold}${c.magenta}  📋  REVIEW RESULT${c.reset}`);
  console.log(divider('═'));

  const vColor = verdictColor(result.verdict);
  console.log(`\n  Score    ${scoreBar(result.score)}`);
  console.log(`  Verdict  ${vColor}${c.bold}${verdictToEmoji(result.verdict)}${c.reset}`);
  console.log(`  Critical ${result.criticalIssuesCount > 0 ? c.red : c.green}${result.criticalIssuesCount} issue(s)${c.reset}`);
  console.log(`  Inline   ${c.cyan}${result.inlineComments.length} comment(s)${c.reset}`);
  console.log(`  Duration ${c.dim}31.4s${c.reset}`);

  console.log('\n' + divider('─'));
  console.log(`\n${c.bold}  Full Review:${c.reset}\n`);

  const indented = MOCK_REVIEW.split('\n')
    .map((line) => {
      if (line.startsWith('## ')) return `${c.bold}${c.cyan}  ${line}${c.reset}`;
      if (line.startsWith('**Score:') || line.startsWith('**Veredicto:')) return `  ${c.bold}${line}${c.reset}`;
      if (line.startsWith('- ') || line.startsWith('* ')) return `  ${c.white}${line}${c.reset}`;
      if (line.startsWith('```')) return `  ${c.dim}${line}${c.reset}`;
      return `  ${line}`;
    })
    .join('\n');

  console.log(indented);
  console.log('\n' + divider('═') + '\n');
}

main();

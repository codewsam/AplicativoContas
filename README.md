# 💳 Contas & Cartão

Aplicativo web progressivo (PWA), mobile-first, focado em agilidade de preenchimento, persistência total de dados e compartilhamento da divisão de gastos do cartão por pessoa.

---

## 🚀 Funcionalidades

### 1. Duas Abas Principais
- **Gastos Próprios**: Adicione rapidamente despesas pessoais com descrição, categoria, valor em R$ e data. Acompanhe o total acumulado e gerencie seus gastos individuais.
- **Divisão do Cartão**:
  - Adicione quantas pessoas quiser à fatura.
  - Cada pessoa ganha uma coluna própria com identificador visual e cor única.
  - Em cada coluna, insira diretamente o **local da compra** e o **valor**.
  - O aplicativo calcula automaticamente o subtotal de cada pessoa, a porcentagem correspondente da fatura e o **Total Geral da Fatura**.

### 2. Baixar e Compartilhar Tabela
- **Baixar Imagem (PNG)**: Gera uma imagem de alta definição com design de fatura premium pronta para envio. Mostra o total geral, o resumo por pessoa e o extrato discriminado de cada um.
- **Copiar para WhatsApp**: Formata o relatório com texto limpo e organizado com um único clique.
- **Compartilhar Nativo**: Integração com a API de compartilhamento do celular para enviar direto para contatos ou grupos.
- **Exportar CSV**: Baixe a planilha formatada para abrir no Excel ou Google Planilhas.

### 3. Persistência de Dados Garantida (Nunca perde informações)
- **Camada Dupla Local**: Salva simultaneamente no `localStorage` e no `IndexedDB`.
- **Storage Persistence**: Usa a API `navigator.storage.persist()` para instruir o sistema do celular a não limpar os dados por falta de espaço em cache.
- **Backup e Restauração**: Exporte seus dados em `.json` ou restaure em qualquer outro aparelho a qualquer momento.

### 4. Experiência de Uso (UX & Mobile)
- **Máscara Monetária Automática**: Digite os números continuamente no celular sem precisar de vírgula ou ponto (ex: digitou 1500 vira R$ 15,00).
- Suporte a teclado numérico (`inputmode="numeric"`).
- Atalhos rápidos em pílulas para navegar entre colunas no celular.
- Funciona 100% offline (PWA com Service Worker).

---

## 📱 Como Abrir e Usar no Celular

### Opção 1: Abrir no Computador
Basta dar dois cliques no arquivo `index.html`.

### Opção 2: Acessar pelo Celular na Rede Wi-Fi
Se o celular estiver conectado no mesmo Wi-Fi do computador:
```powershell
python -m http.server 8080 --directory "\\micro7\2023-2024-A\Engenheiros 2026\Samuel\Web\appcontas"
```
E acessar no navegador do celular pelo IP da sua máquina (ex: `http://192.168.x.x:8080`).

Para instalar no celular como aplicativo:
- **No iPhone (Safari)**: Toque no botão Compartilhar ➔ *Adicionar à Tela de Início*.
- **No Android (Chrome)**: Toque nos três pontinhos ➔ *Instalar aplicativo* ou *Adicionar à tela inicial*.

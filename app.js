/**
 * Contas & Cartão - Aplicativo Web PWA
 * Gerenciamento de gastos próprios e divisão de fatura de cartão por pessoa.
 * Persistência dupla com IndexedDB + localStorage + navigator.storage.persist().
 */

// ==========================================================================
// PALETA DE CORES PARA AVATARES DAS PESSOAS
// ==========================================================================
const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#3b82f6', // Blue
  '#84cc16'  // Lime
];

function getDefaultPresets() {
  return [
    { id: 'pre_1', name: 'Cartão' },
    { id: 'pre_2', name: 'Mercado' },
    { id: 'pre_3', name: 'Almoço' },
    { id: 'pre_4', name: 'Uber' }
  ];
}

// ==========================================================================
// ESTADO GLOBAL DO APLICATIVO
// ==========================================================================
const DEFAULT_STATE = {
  invoiceTitle: 'Fatura do Cartão',
  personalBudget: 0,
  fixedBills: [],
  personalExpenses: [],
  people: [
    {
      id: 'p_1',
      name: 'Samuel',
      color: AVATAR_COLORS[0],
      presets: getDefaultPresets(),
      expenses: []
    }
  ],
  lastUpdated: Date.now()
};

let appState = JSON.parse(JSON.stringify(DEFAULT_STATE));

// ==========================================================================
// PERSISTÊNCIA DUPLA: INDEXEDDB + LOCALSTORAGE + STORAGE PERSIST
// ==========================================================================
const DB_NAME = 'AppContasDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

class AppStorage {
  static openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async initStorage() {
    // Solicita persistência sem expiração ao celular/navegador
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        const badge = document.getElementById('persistStatusBadge');
        if (badge) {
          badge.textContent = isPersisted ? 'Permanente' : 'Ativo';
        }
      } catch (err) {
        console.warn('Erro ao solicitar storage persistente:', err);
      }
    }

    // Carrega dados salvos
    let loadedData = null;

    // 1. Tenta carregar do IndexedDB
    try {
      const db = await this.openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('current_state');
      loadedData = await new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('IndexedDB inacessível, usando localStorage:', e);
    }

    // 2. Se falhar ou estiver vazio, tenta localStorage
    if (!loadedData) {
      try {
        const local = localStorage.getItem('appcontas_state');
        if (local) {
          loadedData = JSON.parse(local);
        }
      } catch (e) {
        console.warn('Erro ao ler localStorage:', e);
      }
    }

    if (loadedData) {
      const rawPeople = loadedData.people || DEFAULT_STATE.people;
      const peopleWithPresets = rawPeople.map(p => ({
        ...p,
        presets: (p.presets && p.presets.length > 0) ? p.presets : getDefaultPresets()
      }));

      appState = {
        ...DEFAULT_STATE,
        ...loadedData,
        people: peopleWithPresets,
        fixedBills: loadedData.fixedBills || [],
        personalExpenses: loadedData.personalExpenses || []
      };
    }
  }

  static async saveState() {
    appState.lastUpdated = Date.now();
    const dataString = JSON.stringify(appState);

    // 1. Grava no localStorage imediatamente
    try {
      localStorage.setItem('appcontas_state', dataString);
    } catch (err) {
      console.warn('Erro ao salvar no localStorage:', err);
    }

    // 2. Grava no IndexedDB de forma assíncrona
    try {
      const db = await this.openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(appState, 'current_state');
    } catch (err) {
      console.warn('Erro ao salvar no IndexedDB:', err);
    }

    // Feedback visual discreto de salvamento
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
      syncStatus.innerHTML = '<span class="sync-dot"></span> Dados salvos';
    }
  }
}

// ==========================================================================
// UTILITÁRIOS: FORMATAÇÃO MONETÁRIA E DATAS
// ==========================================================================
function formatCurrency(val) {
  const num = typeof val === 'number' ? val : parseFloat(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseCurrencyInput(valueStr) {
  if (!valueStr) return 0;
  // Remove R$, pontos e caracteres não numéricos exceto vírgula
  const clean = valueStr.toString().replace(/[^\d]/g, '');
  if (!clean) return 0;
  return parseFloat(clean) / 100;
}

function maskCurrency(input) {
  input.addEventListener('input', (e) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      e.target.value = '';
      return;
    }
    const val = (parseInt(raw, 10) / 100).toFixed(2);
    const parts = val.split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    e.target.value = `R$ ${integerPart},${parts[1]}`;
  });
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${day} de ${months[parseInt(month, 10) - 1]}`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

function triggerHaptic() {
  if (navigator.vibrate) {
    try { navigator.vibrate(15); } catch (e) {}
  }
}

// ==========================================================================
// RENDERIZAÇÃO: ABA 1 - GASTOS PRÓPRIOS
// ==========================================================================
function renderPersonalExpenses() {
  const listEl = document.getElementById('personalExpensesList');
  const remainingEl = document.getElementById('personalRemainingAmount');
  const initialBudgetEl = document.getElementById('personalInitialBudget');
  const fixedBillsTotalEl = document.getElementById('personalFixedBillsTotal');
  const totalAmountEl = document.getElementById('personalTotalAmount');
  const totalItemsEl = document.getElementById('personalTotalItems');
  const badgeCountEl = document.getElementById('personalBadgeCount');
  const statusBadge = document.getElementById('budgetStatusBadge');
  const progressWrap = document.getElementById('budgetProgressWrap');
  const progressFill = document.getElementById('budgetProgressFill');
  const spentPercentEl = document.getElementById('budgetSpentPercent');
  const remainingPercentEl = document.getElementById('budgetRemainingPercent');
  const btnEditBudgetLabel = document.getElementById('btnEditBudgetLabel');

  const items = appState.personalExpenses || [];
  const totalVariable = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const fixedBills = appState.fixedBills || [];
  const totalFixed = fixedBills.reduce((sum, item) => sum + (item.amount || 0), 0);
  const paidFixedCount = fixedBills.filter(b => b.paid).length;

  const totalCommitted = totalFixed + totalVariable;
  const initialBudget = appState.personalBudget || 0;
  const remaining = initialBudget - totalCommitted;

  if (fixedBillsTotalEl) fixedBillsTotalEl.textContent = formatCurrency(totalFixed);
  if (totalAmountEl) totalAmountEl.textContent = formatCurrency(totalVariable);
  if (totalItemsEl) totalItemsEl.textContent = `${items.length} ${items.length === 1 ? 'gasto' : 'gastos'}`;
  if (badgeCountEl) badgeCountEl.textContent = items.length;
  if (initialBudgetEl) initialBudgetEl.textContent = formatCurrency(initialBudget);

  if (initialBudget > 0) {
    if (btnEditBudgetLabel) btnEditBudgetLabel.textContent = 'Alterar Saldo';
    if (progressWrap) progressWrap.style.display = 'flex';

    if (remaining >= 0) {
      if (remainingEl) {
        remainingEl.textContent = formatCurrency(remaining);
        remainingEl.style.color = '#ffffff';
      }
      if (statusBadge) {
        statusBadge.textContent = 'Dentro do saldo';
        statusBadge.className = 'budget-badge badge-ok';
      }
      const spentPct = Math.min(100, Math.round((totalCommitted / initialBudget) * 100));
      if (progressFill) {
        progressFill.style.width = `${spentPct}%`;
        progressFill.className = 'budget-progress-fill fill-normal';
      }
      if (spentPercentEl) spentPercentEl.textContent = `${spentPct}% do saldo comprometido`;
      if (remainingPercentEl) remainingPercentEl.textContent = `${formatCurrency(remaining)} restante`;
    } else {
      // Saldo estourado
      if (remainingEl) {
        remainingEl.textContent = formatCurrency(remaining);
        remainingEl.style.color = '#f43f5e';
      }
      if (statusBadge) {
        statusBadge.textContent = 'Saldo estourado';
        statusBadge.className = 'budget-badge badge-alert';
      }
      if (progressFill) {
        progressFill.style.width = '100%';
        progressFill.className = 'budget-progress-fill fill-alert';
      }
      if (spentPercentEl) spentPercentEl.textContent = `Estourou em ${formatCurrency(Math.abs(remaining))}`;
      if (remainingPercentEl) remainingPercentEl.textContent = '0% restante';
    }
  } else {
    // Sem saldo definido ainda
    if (btnEditBudgetLabel) btnEditBudgetLabel.textContent = 'Definir Saldo';
    if (progressWrap) progressWrap.style.display = 'none';
    if (remainingEl) {
      remainingEl.textContent = formatCurrency(totalCommitted > 0 ? -totalCommitted : 0);
      remainingEl.style.color = totalCommitted > 0 ? '#f43f5e' : '#ffffff';
    }
    if (statusBadge) {
      statusBadge.textContent = totalCommitted > 0 ? 'Sem saldo definido' : 'Sem saldo';
      statusBadge.className = 'budget-badge badge-neutral';
    }
  }

  // Renderiza Contas Fixas
  const fixedListEl = document.getElementById('fixedBillsList');
  const fixedSubtitleEl = document.getElementById('fixedBillsSummarySubtitle');

  if (fixedSubtitleEl) {
    fixedSubtitleEl.textContent = `${formatCurrency(totalFixed)} · ${fixedBills.length} ${fixedBills.length === 1 ? 'conta' : 'contas'} (${paidFixedCount} pagas)`;
  }

  if (fixedListEl) {
    if (fixedBills.length === 0) {
      fixedListEl.innerHTML = `
        <div class="fixed-bill-empty">
          Nenhuma conta fixa cadastrada. Toque em "+ Nova Conta" para adicionar aluguel, internet, luz, academia, etc.
        </div>
      `;
    } else {
      fixedListEl.innerHTML = fixedBills.map(b => `
        <div class="fixed-bill-item ${b.paid ? 'paid' : ''}">
          <div class="fixed-bill-left">
            <button type="button" class="fixed-bill-status-btn ${b.paid ? 'paid' : 'pending'}" onclick="toggleFixedBillPaid('${b.id}')" title="Marcar como ${b.paid ? 'pendente' : 'paga'}">
              ${b.paid ? '✔ Paga' : '⏳ Pendente'}
            </button>
            <div class="fixed-bill-details">
              <span class="fixed-bill-title">${escapeHtml(b.description)}</span>
              ${b.dueDay ? `<span class="fixed-bill-due">Vencimento todo dia ${escapeHtml(b.dueDay.toString())}</span>` : ''}
            </div>
          </div>
          <div class="fixed-bill-right">
            <span class="fixed-bill-amount">${formatCurrency(b.amount)}</span>
            <button class="delete-btn" onclick="deleteFixedBill('${b.id}')" title="Excluir conta fixa" aria-label="Excluir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <p class="empty-text">Nenhum gasto próprio cadastrado ainda.</p>
      </div>
    `;
    return;
  }

  // Renderiza itens em ordem decrescente (mais recentes primeiro)
  listEl.innerHTML = items
    .slice()
    .reverse()
    .map((item) => `
      <div class="expense-item" data-id="${item.id}">
        <div class="expense-main">
          <span class="expense-desc">${escapeHtml(item.description)}</span>
          <div class="expense-meta">
            <span class="category-tag">${escapeHtml(item.category || 'Outros')}</span>
            <span>${formatDateDisplay(item.date)}</span>
          </div>
        </div>
        <div class="expense-val-actions">
          <span class="expense-amount">${formatCurrency(item.amount)}</span>
          <button class="delete-btn" onclick="deletePersonalExpense('${item.id}')" title="Excluir gasto" aria-label="Excluir">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `)
    .join('');
}

window.deletePersonalExpense = function(id) {
  appState.personalExpenses = appState.personalExpenses.filter(i => i.id !== id);
  AppStorage.saveState();
  renderPersonalExpenses();
  showToast('Gasto removido');
  triggerHaptic();
};

window.toggleFixedBillPaid = function(billId) {
  const bill = (appState.fixedBills || []).find(b => b.id === billId);
  if (!bill) return;
  bill.paid = !bill.paid;
  AppStorage.saveState();
  renderPersonalExpenses();
  showToast(bill.paid ? `Conta "${bill.description}" marcada como paga` : `Conta "${bill.description}" pendente`);
  triggerHaptic();
};

window.deleteFixedBill = function(billId) {
  const bill = (appState.fixedBills || []).find(b => b.id === billId);
  if (!bill) return;
  if (confirm(`Excluir conta fixa "${bill.description}"?`)) {
    appState.fixedBills = appState.fixedBills.filter(b => b.id !== billId);
    AppStorage.saveState();
    renderPersonalExpenses();
    showToast('Conta fixa excluída');
    triggerHaptic();
  }
};

// ==========================================================================
// RENDERIZAÇÃO: ABA 2 - DIVISÃO DO CARTÃO (COLUNAS & PESSOAS)
// ==========================================================================
function renderCardDivision() {
  const people = appState.people || [];
  const boardEl = document.getElementById('peopleBoard');
  const pillsBar = document.getElementById('peoplePillsBar');
  const grandTotalEl = document.getElementById('cardGrandTotal');
  const peopleCountEl = document.getElementById('cardPeopleCount');
  const totalPurchasesEl = document.getElementById('cardTotalPurchases');
  const badgeCountEl = document.getElementById('cardBadgeCount');
  const invoiceTitleInput = document.getElementById('invoiceTitle');

  if (invoiceTitleInput && appState.invoiceTitle) {
    invoiceTitleInput.value = appState.invoiceTitle;
  }

  // Cálculos consolidados
  let grandTotal = 0;
  let totalPurchases = 0;

  const peopleTotals = people.map(p => {
    const pTotal = (p.expenses || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    grandTotal += pTotal;
    totalPurchases += (p.expenses || []).length;
    return { id: p.id, total: pTotal };
  });

  grandTotalEl.textContent = formatCurrency(grandTotal);
  peopleCountEl.textContent = people.length;
  totalPurchasesEl.textContent = `${totalPurchases} ${totalPurchases === 1 ? 'compra' : 'compras'} no total`;
  badgeCountEl.textContent = people.length;

  // 1. Renderiza a barra de pílulas rápidas para navegação no celular
  if (people.length > 1) {
    pillsBar.style.display = 'flex';
    pillsBar.innerHTML = people.map(p => {
      const pTot = peopleTotals.find(pt => pt.id === p.id)?.total || 0;
      return `
        <button class="person-pill" onclick="scrollToPersonColumn('${p.id}')">
          <span class="pill-dot" style="background-color: ${p.color};"></span>
          <span>${escapeHtml(p.name)}</span>
          <span class="pill-amount">${formatCurrency(pTot)}</span>
        </button>
      `;
    }).join('');
  } else {
    pillsBar.style.display = 'none';
  }

  // 2. Renderiza as colunas de cada pessoa
  if (people.length === 0) {
    boardEl.innerHTML = `
      <div class="empty-box full-width" style="margin: 0 auto; max-width: 420px;">
        <div class="empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
        </div>
        <p class="empty-text">Nenhuma pessoa adicionada ao cartão.</p>
        <button class="btn btn-primary btn-sm" onclick="openModal('modalAddPerson')">
          + Adicionar Primeira Pessoa
        </button>
      </div>
    `;
    return;
  }

  let columnsHtml = people.map((person) => {
    const expenses = person.expenses || [];
    const personTotal = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
    const percentage = grandTotal > 0 ? ((personTotal / grandTotal) * 100).toFixed(0) : 0;
    const initial = person.name.charAt(0).toUpperCase();

    const itemsHtml = expenses.length > 0 ? expenses.map((exp) => `
      <div class="column-item-row" data-exp-id="${exp.id}">
        <span class="column-item-place" title="${escapeHtml(exp.place)}">${escapeHtml(exp.place)}</span>
        <div class="column-item-right">
          <span class="column-item-val">${formatCurrency(exp.amount)}</span>
          <button class="column-item-del" onclick="deletePersonExpense('${person.id}', '${exp.id}')" title="Remover item" aria-label="Remover">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `).join('') : `
      <div class="column-empty-state">Sem compras para esta pessoa</div>
    `;

    return `
      <div class="person-column" id="col_${person.id}">
        <div class="person-color-bar" style="background-color: ${person.color};"></div>
        
        <!-- Header da Coluna -->
        <div class="person-column-header">
          <div class="person-user-info">
            <div class="person-avatar" style="background-color: ${person.color};">
              ${initial}
            </div>
            <div class="person-name-wrap">
              <span class="person-name">${escapeHtml(person.name)}</span>
              <span class="person-share-ratio">${percentage}% do total (${expenses.length} itens)</span>
            </div>
          </div>
          <div class="person-header-actions">
            <button class="person-config-btn" onclick="openConfigPerson('${person.id}')" title="Configurar atalhos e perfil" aria-label="Configurar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="person-del-btn" onclick="confirmDeletePerson('${person.id}', '${escapeHtml(person.name)}')" title="Remover pessoa" aria-label="Remover pessoa">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Formulário Rápido de Compra Dentro da Coluna -->
        <div class="column-add-box">
          <form class="column-add-form" onsubmit="handleAddPersonExpense(event, '${person.id}')">
            <input type="text" id="input_place_${person.id}" placeholder="Onde comprou" required autocomplete="off">
            <input type="text" id="input_val_${person.id}" class="currency-mask" inputmode="numeric" placeholder="R$ 0,00" required autocomplete="off">
            <button type="submit" class="column-add-btn" title="Adicionar compra">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </form>
        </div>

        <!-- Barra de Atalhos de Gastos Frequentes da Pessoa -->
        <div class="column-presets-bar">
          ${(person.presets || []).map(pr => `
            <button type="button" class="preset-chip" onclick="applyPreset('${person.id}', '${escapeHtml(pr.name)}', ${pr.amount || 0})" title="Preencher ${escapeHtml(pr.name)}">
              ${escapeHtml(pr.name)}${pr.amount ? ` · ${formatCurrency(pr.amount)}` : ''}
            </button>
          `).join('')}
          <button type="button" class="preset-chip-add" onclick="openConfigPerson('${person.id}')" title="Configurar atalhos">+ Atalho</button>
        </div>

        <!-- Tabela / Lista de Compras da Pessoa -->
        <div class="column-items-table">
          ${itemsHtml}
        </div>

        <!-- Rodapé da Coluna com Subtotal -->
        <div class="column-footer">
          <span class="column-footer-label">Total a Pagar</span>
          <span class="column-footer-amount">${formatCurrency(personTotal)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Adiciona o card pontilhado "+ Nova Pessoa" no final da esteira
  columnsHtml += `
    <button class="add-person-column-card" onclick="openModal('modalAddPerson')">
      <div class="add-person-circle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
      <span style="font-weight: 600; font-size: 0.9rem;">+ Adicionar Pessoa</span>
    </button>
  `;

  boardEl.innerHTML = columnsHtml;

  // Aplica máscara monetária em todos os inputs recém-criados
  document.querySelectorAll('.currency-mask').forEach(input => maskCurrency(input));
}

window.scrollToPersonColumn = function(personId) {
  const col = document.getElementById(`col_${personId}`);
  if (col) {
    col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
};

window.handleAddPersonExpense = function(event, personId) {
  event.preventDefault();
  const placeInput = document.getElementById(`input_place_${personId}`);
  const valInput = document.getElementById(`input_val_${personId}`);

  if (!placeInput || !valInput) return;

  const place = placeInput.value.trim();
  const amount = parseCurrencyInput(valInput.value);

  if (!place) {
    placeInput.focus();
    return;
  }
  if (amount <= 0) {
    valInput.focus();
    showToast('Informe um valor maior que zero');
    return;
  }

  const person = appState.people.find(p => p.id === personId);
  if (!person) return;

  if (!person.expenses) person.expenses = [];
  person.expenses.push({
    id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    place,
    amount,
    date: new Date().toISOString().split('T')[0]
  });

  AppStorage.saveState();
  renderCardDivision();
  triggerHaptic();

  // Foco de volta no campo de local para adicionar a próxima compra rapidamente
  const nextInput = document.getElementById(`input_place_${personId}`);
  if (nextInput) nextInput.focus();
};

window.deletePersonExpense = function(personId, expId) {
  const person = appState.people.find(p => p.id === personId);
  if (!person || !person.expenses) return;

  person.expenses = person.expenses.filter(e => e.id !== expId);
  AppStorage.saveState();
  renderCardDivision();
  triggerHaptic();
};

window.confirmDeletePerson = function(personId, personName) {
  if (confirm(`Remover "${personName}" e todos os seus gastos da fatura?`)) {
    appState.people = appState.people.filter(p => p.id !== personId);
    AppStorage.saveState();
    renderCardDivision();
    showToast(`"${personName}" removido(a)`);
    triggerHaptic();
  }
};

// ==========================================================================
// ATALHOS / GASTOS FREQUENTES & CONFIGURAÇÃO DA PESSOA
// ==========================================================================
window.applyPreset = function(personId, name, amount) {
  const placeInput = document.getElementById(`input_place_${personId}`);
  const valInput = document.getElementById(`input_val_${personId}`);
  if (!placeInput || !valInput) return;

  placeInput.value = name;
  if (amount && amount > 0) {
    const cents = Math.round(amount * 100).toString();
    const val = (parseInt(cents, 10) / 100).toFixed(2);
    const parts = val.split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    valInput.value = `R$ ${integerPart},${parts[1]}`;
    valInput.focus();
  } else {
    valInput.value = '';
    valInput.focus();
  }
  showToast(`Atalho "${name}" preenchido`);
  triggerHaptic();
};

let currentEditingPersonId = null;
let currentEditingPresets = [];
let currentEditingColor = '';

window.openConfigPerson = function(personId) {
  const person = appState.people.find(p => p.id === personId);
  if (!person) return;

  currentEditingPersonId = personId;
  currentEditingPresets = JSON.parse(JSON.stringify(person.presets || getDefaultPresets()));
  currentEditingColor = person.color || AVATAR_COLORS[0];

  document.getElementById('configPersonId').value = person.id;
  document.getElementById('configPersonName').value = person.name;

  renderConfigColorPicker();
  renderConfigPresetsList();

  const newPresetName = document.getElementById('newPresetName');
  const newPresetAmount = document.getElementById('newPresetAmount');
  if (newPresetName) newPresetName.value = '';
  if (newPresetAmount) newPresetAmount.value = '';

  openModal('modalConfigPerson');
};

function renderConfigColorPicker() {
  const container = document.getElementById('configColorPicker');
  if (!container) return;

  container.innerHTML = AVATAR_COLORS.map(color => `
    <button type="button" class="color-dot-btn ${color === currentEditingColor ? 'selected' : ''}" 
      style="background-color: ${color};" 
      onclick="selectConfigColor('${color}')"
      title="Selecionar cor">
    </button>
  `).join('');
}

window.selectConfigColor = function(color) {
  currentEditingColor = color;
  renderConfigColorPicker();
  triggerHaptic();
};

function renderConfigPresetsList() {
  const container = document.getElementById('configPresetsList');
  if (!container) return;

  if (currentEditingPresets.length === 0) {
    container.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted);">Nenhum atalho configurado para esta pessoa.</span>`;
    return;
  }

  container.innerHTML = currentEditingPresets.map((pr) => `
    <div class="preset-manage-tag">
      <span>${escapeHtml(pr.name)}</span>
      ${pr.amount ? `<span class="tag-val">${formatCurrency(pr.amount)}</span>` : ''}
      <button type="button" class="preset-manage-del" onclick="deleteConfigPreset('${pr.id}')" title="Excluir atalho" aria-label="Excluir">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `).join('');
}

window.deleteConfigPreset = function(presetId) {
  currentEditingPresets = currentEditingPresets.filter(p => p.id !== presetId);
  renderConfigPresetsList();
  triggerHaptic();
};

// ==========================================================================
// EXPORTAÇÃO: BAIXAR TABELA (PNG, WHATSAPP, CSV)
// ==========================================================================
function updateReceiptPreview() {
  const people = appState.people || [];
  const title = appState.invoiceTitle || 'Fatura do Cartão';
  
  const receiptTitle = document.getElementById('receiptTitle');
  const receiptDate = document.getElementById('receiptDate');
  const receiptTotalAmount = document.getElementById('receiptTotalAmount');
  const receiptSummaryBody = document.getElementById('receiptSummaryBody');
  const receiptDetailsGrid = document.getElementById('receiptDetailsGrid');
  const receiptGeneratedAt = document.getElementById('receiptGeneratedAt');

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const timeFormatted = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (receiptTitle) receiptTitle.textContent = title;
  if (receiptDate) receiptDate.textContent = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
  if (receiptGeneratedAt) receiptGeneratedAt.textContent = timeFormatted;

  let grandTotal = 0;
  people.forEach(p => {
    grandTotal += (p.expenses || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  });

  if (receiptTotalAmount) receiptTotalAmount.textContent = formatCurrency(grandTotal);

  // Tabela Resumo
  if (receiptSummaryBody) {
    receiptSummaryBody.innerHTML = people.map(p => {
      const expenses = p.expenses || [];
      const personTotal = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
      const pct = grandTotal > 0 ? ((personTotal / grandTotal) * 100).toFixed(1) : '0';
      return `
        <tr>
          <td><strong style="color: #ffffff;">${escapeHtml(p.name)}</strong></td>
          <td>${expenses.length}</td>
          <td style="text-align: right;"><strong>${formatCurrency(personTotal)}</strong></td>
          <td style="text-align: right; color: #a1a1aa;">${pct}%</td>
        </tr>
      `;
    }).join('');
  }

  // Grid de Detalhes
  if (receiptDetailsGrid) {
    receiptDetailsGrid.innerHTML = people.map(p => {
      const expenses = p.expenses || [];
      const personTotal = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
      return `
        <div class="receipt-person-card">
          <div class="receipt-person-top">
            <span class="receipt-person-name">${escapeHtml(p.name)}</span>
            <span class="receipt-person-total">${formatCurrency(personTotal)}</span>
          </div>
          <div class="receipt-items-list">
            ${expenses.length > 0 ? expenses.map(e => `
              <div class="receipt-item-line">
                <span>• ${escapeHtml(e.place)}</span>
                <span>${formatCurrency(e.amount)}</span>
              </div>
            `).join('') : '<div style="color: #71717a; font-size: 0.75rem;">Nenhum item</div>'}
          </div>
        </div>
      `;
    }).join('');
  }
}

// Download como Imagem PNG de Alta Definição
async function exportTableAsImage() {
  const card = document.getElementById('receiptRenderArea');
  if (!card) return;

  showToast('Gerando imagem...');
  triggerHaptic();

  try {
    if (typeof html2canvas === 'undefined') {
      alert('Biblioteca de renderização carregando. Tente novamente em alguns segundos.');
      return;
    }

    const canvas = await html2canvas(card, {
      scale: 2, // 2x para Retina / visual ultra nítido
      backgroundColor: '#0f1013',
      logging: false,
      useCORS: true
    });

    const link = document.createElement('a');
    const safeTitle = (appState.invoiceTitle || 'fatura-cartao')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    link.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('Imagem baixada com sucesso!');
  } catch (err) {
    console.error('Erro ao gerar imagem:', err);
    showToast('Erro ao gerar imagem');
  }
}

// Compartilhar Nativo (Celular / WhatsApp)
async function shareTableNative() {
  const card = document.getElementById('receiptRenderArea');
  if (!card) return;

  try {
    if (typeof html2canvas === 'undefined') return;

    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: '#0f1013',
      logging: false
    });

    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'fatura-divisao.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: appState.invoiceTitle || 'Divisão da Fatura',
          text: buildWhatsAppText(),
          files: [file]
        });
      } else if (navigator.share) {
        await navigator.share({
          title: appState.invoiceTitle || 'Divisão da Fatura',
          text: buildWhatsAppText()
        });
      } else {
        // Fallback: copia o texto
        copyWhatsAppSummary();
      }
    }, 'image/png');
  } catch (err) {
    console.warn('Erro ao compartilhar:', err);
    copyWhatsAppSummary();
  }
}

// Formata texto com quebras e emojis limpos para envio no WhatsApp
function buildWhatsAppText() {
  const people = appState.people || [];
  const title = appState.invoiceTitle || 'Fatura do Cartão';
  
  let grandTotal = 0;
  people.forEach(p => {
    grandTotal += (p.expenses || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  });

  let text = `💳 *${title.toUpperCase()}*\n`;
  text += `💰 *Total Geral: ${formatCurrency(grandTotal)}*\n`;
  text += `──────────────────\n\n`;

  people.forEach(p => {
    const expenses = p.expenses || [];
    const personTotal = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
    const pct = grandTotal > 0 ? ((personTotal / grandTotal) * 100).toFixed(0) : '0';

    text += `👤 *${p.name.toUpperCase()}* — *${formatCurrency(personTotal)}* (${pct}%)\n`;
    if (expenses.length > 0) {
      expenses.forEach(e => {
        text += `  • ${e.place}: ${formatCurrency(e.amount)}\n`;
      });
    } else {
      text += `  • Sem gastos registrados\n`;
    }
    text += `\n`;
  });

  text += `──────────────────\n`;
  text += `Gerado pelo app Contas & Cartão`;

  return text;
}

function copyWhatsAppSummary() {
  const text = buildWhatsAppText();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Resumo copiado para o WhatsApp!');
      triggerHaptic();
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('Resumo copiado para o WhatsApp!');
    triggerHaptic();
  } catch (err) {
    showToast('Não foi possível copiar');
  }
  document.body.removeChild(ta);
}

// Download como CSV para Excel
function exportTableAsCSV() {
  const people = appState.people || [];
  let csv = 'Pessoa,Local da Compra,Valor (R$),Data\n';

  people.forEach(p => {
    const expenses = p.expenses || [];
    if (expenses.length === 0) {
      csv += `"${p.name}","Nenhum",0.00,""\n`;
    } else {
      expenses.forEach(e => {
        csv += `"${p.name}","${e.place.replace(/"/g, '""')}",${e.amount.toFixed(2)},"${e.date || ''}"\n`;
      });
    }
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `divisao-cartao-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  showToast('Planilha CSV baixada!');
}

// ==========================================================================
// MODAL CONTROLLERS & EVENT HANDLERS
// ==========================================================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    if (id === 'modalDownload') {
      updateReceiptPreview();
    }
    const autoFocusEl = modal.querySelector('[autofocus]');
    if (autoFocusEl) setTimeout(() => autoFocusEl.focus(), 150);
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// INICIALIZAÇÃO DO APLICATIVO
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializa persistência
  await AppStorage.initStorage();

  // 2. Preenche data de hoje no form pessoal
  const personalDateInput = document.getElementById('personalDate');
  if (personalDateInput) {
    personalDateInput.value = new Date().toISOString().split('T')[0];
  }

  // 3. Aplica máscaras nos campos de valor existentes
  const personalAmountInput = document.getElementById('personalAmount');
  if (personalAmountInput) maskCurrency(personalAmountInput);

  // 4. Renderiza as telas
  renderPersonalExpenses();
  renderCardDivision();

  // 5. Configura navegação por abas
  const tabPersonal = document.getElementById('tabPersonal');
  const tabCard = document.getElementById('tabCard');
  const panePersonal = document.getElementById('panePersonal');
  const paneCard = document.getElementById('paneCard');

  tabPersonal.addEventListener('click', () => {
    tabPersonal.classList.add('active');
    tabCard.classList.remove('active');
    panePersonal.classList.add('active');
    paneCard.classList.remove('active');
    triggerHaptic();
  });

  tabCard.addEventListener('click', () => {
    tabCard.classList.add('active');
    tabPersonal.classList.remove('active');
    paneCard.classList.add('active');
    panePersonal.classList.remove('active');
    triggerHaptic();
  });

  // 6. Formulário: Gasto Próprio
  const formPersonal = document.getElementById('formPersonal');
  formPersonal.addEventListener('submit', (e) => {
    e.preventDefault();
    const desc = document.getElementById('personalDesc').value.trim();
    const amount = parseCurrencyInput(personalAmountInput.value);
    const category = document.getElementById('personalCategory').value;
    const date = personalDateInput.value || new Date().toISOString().split('T')[0];

    if (!desc) return;
    if (amount <= 0) {
      showToast('Informe um valor válido');
      personalAmountInput.focus();
      return;
    }

    appState.personalExpenses.push({
      id: 'p_exp_' + Date.now(),
      description: desc,
      amount,
      category,
      date
    });

    AppStorage.saveState();
    renderPersonalExpenses();
    showToast('Gasto salvo com sucesso');
    triggerHaptic();

    // Limpa formulário mantendo data
    document.getElementById('personalDesc').value = '';
    personalAmountInput.value = '';
    document.getElementById('personalDesc').focus();
  });

  // Limpar gastos próprios
  document.getElementById('btnClearPersonal').addEventListener('click', () => {
    if (appState.personalExpenses.length === 0) return;
    if (confirm('Deseja limpar todos os seus gastos próprios?')) {
      appState.personalExpenses = [];
      AppStorage.saveState();
      renderPersonalExpenses();
      showToast('Gastos próprios limpos');
    }
  });

  // 6.1 Saldo / Orçamento Próprio
  const btnEditBudget = document.getElementById('btnEditBudget');
  const formSetBudget = document.getElementById('formSetBudget');
  const inputBudgetAmount = document.getElementById('inputBudgetAmount');

  if (inputBudgetAmount) maskCurrency(inputBudgetAmount);

  if (btnEditBudget) {
    btnEditBudget.addEventListener('click', () => {
      if (inputBudgetAmount) {
        const cur = appState.personalBudget || 0;
        if (cur > 0) {
          const cents = Math.round(cur * 100).toString();
          const val = (parseInt(cents, 10) / 100).toFixed(2);
          const parts = val.split('.');
          const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
          inputBudgetAmount.value = `R$ ${integerPart},${parts[1]}`;
        } else {
          inputBudgetAmount.value = '';
        }
      }
      openModal('modalSetBudget');
    });
  }

  if (formSetBudget) {
    formSetBudget.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = parseCurrencyInput(inputBudgetAmount.value);
      appState.personalBudget = val;
      AppStorage.saveState();
      renderPersonalExpenses();
      closeModal('modalSetBudget');
      showToast(val > 0 ? `Saldo definido: ${formatCurrency(val)}` : 'Saldo zerado');
      triggerHaptic();
    });
  }

  // 6.2 Contas Fixas
  const btnOpenAddFixedBill = document.getElementById('btnOpenAddFixedBill');
  const formAddFixedBill = document.getElementById('formAddFixedBill');
  const fixedBillDesc = document.getElementById('fixedBillDesc');
  const fixedBillAmount = document.getElementById('fixedBillAmount');
  const fixedBillDueDay = document.getElementById('fixedBillDueDay');

  if (fixedBillAmount) maskCurrency(fixedBillAmount);

  if (btnOpenAddFixedBill) {
    btnOpenAddFixedBill.addEventListener('click', () => {
      if (fixedBillDesc) fixedBillDesc.value = '';
      if (fixedBillAmount) fixedBillAmount.value = '';
      if (fixedBillDueDay) fixedBillDueDay.value = '';
      openModal('modalAddFixedBill');
    });
  }

  if (formAddFixedBill) {
    formAddFixedBill.addEventListener('submit', (e) => {
      e.preventDefault();
      const desc = fixedBillDesc.value.trim();
      const amount = parseCurrencyInput(fixedBillAmount.value);
      const dueDay = fixedBillDueDay.value ? parseInt(fixedBillDueDay.value, 10) : null;

      if (!desc) {
        fixedBillDesc.focus();
        return;
      }
      if (amount <= 0) {
        fixedBillAmount.focus();
        showToast('Informe um valor válido');
        return;
      }

      if (!appState.fixedBills) appState.fixedBills = [];

      appState.fixedBills.push({
        id: 'fix_' + Date.now(),
        description: desc,
        amount,
        dueDay,
        paid: false
      });

      AppStorage.saveState();
      renderPersonalExpenses();
      closeModal('modalAddFixedBill');
      showToast(`Conta fixa "${desc}" adicionada`);
      triggerHaptic();
    });
  }

  // 7. Formulário: Nova Pessoa
  const formAddPerson = document.getElementById('formAddPerson');
  formAddPerson.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newPersonName');
    const name = nameInput.value.trim();
    if (!name) return;

    // Seleciona próxima cor da paleta
    const colorIndex = (appState.people.length) % AVATAR_COLORS.length;
    const color = AVATAR_COLORS[colorIndex];

    const newPerson = {
      id: 'p_' + Date.now(),
      name,
      color,
      presets: getDefaultPresets(),
      expenses: []
    };

    appState.people.push(newPerson);
    AppStorage.saveState();
    renderCardDivision();
    closeModal('modalAddPerson');
    nameInput.value = '';
    showToast(`Coluna de "${name}" criada`);
    triggerHaptic();

    // Rola até a nova coluna
    setTimeout(() => scrollToPersonColumn(newPerson.id), 200);
  });

  // 8. Edição do Título da Fatura
  const invoiceTitleInput = document.getElementById('invoiceTitle');
  if (invoiceTitleInput) {
    invoiceTitleInput.addEventListener('input', (e) => {
      appState.invoiceTitle = e.target.value;
      AppStorage.saveState();
    });
  }

  // 9. Botões de Ação do Cartão
  document.getElementById('btnOpenAddPerson').addEventListener('click', () => openModal('modalAddPerson'));
  document.getElementById('btnDownloadTable').addEventListener('click', () => openModal('modalDownload'));
  document.getElementById('btnCopyWhatsApp').addEventListener('click', () => copyWhatsAppSummary());

  // 9.1 Configuração da Pessoa & Atalhos Rápidos
  const newPresetName = document.getElementById('newPresetName');
  const newPresetAmount = document.getElementById('newPresetAmount');
  const btnAddNewPreset = document.getElementById('btnAddNewPreset');
  const btnSaveConfigPerson = document.getElementById('btnSaveConfigPerson');

  if (newPresetAmount) maskCurrency(newPresetAmount);

  function handleAddNewPreset() {
    const name = newPresetName.value.trim();
    const amount = parseCurrencyInput(newPresetAmount.value);
    if (!name) {
      newPresetName.focus();
      return;
    }

    currentEditingPresets.push({
      id: 'pre_' + Date.now(),
      name,
      amount: amount > 0 ? amount : null
    });

    renderConfigPresetsList();
    newPresetName.value = '';
    newPresetAmount.value = '';
    newPresetName.focus();
    triggerHaptic();
  }

  if (btnAddNewPreset) {
    btnAddNewPreset.addEventListener('click', handleAddNewPreset);
  }

  if (newPresetName) {
    newPresetName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddNewPreset();
      }
    });
  }

  if (btnSaveConfigPerson) {
    btnSaveConfigPerson.addEventListener('click', () => {
      if (!currentEditingPersonId) return;
      const person = appState.people.find(p => p.id === currentEditingPersonId);
      if (!person) return;

      const newName = document.getElementById('configPersonName').value.trim();
      if (!newName) {
        showToast('Informe o nome da pessoa');
        document.getElementById('configPersonName').focus();
        return;
      }

      person.name = newName;
      person.color = currentEditingColor;
      person.presets = currentEditingPresets;

      AppStorage.saveState();
      renderCardDivision();
      closeModal('modalConfigPerson');
      showToast(`Configurações de "${person.name}" salvas!`);
      triggerHaptic();
    });
  }

  // 10. Botões do Modal de Exportação
  document.getElementById('btnExportImage').addEventListener('click', exportTableAsImage);
  document.getElementById('btnShareNative').addEventListener('click', shareTableNative);
  document.getElementById('btnExportCSV').addEventListener('click', exportTableAsCSV);

  // 11. Modal de Backup
  document.getElementById('btnOpenBackup').addEventListener('click', () => openModal('modalBackup'));

  document.getElementById('btnExportJSON').addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `backup-contas-${new Date().toISOString().split('T')[0]}.json`);
    dlAnchor.click();
    showToast('Backup exportado!');
  });

  document.getElementById('fileImportJSON').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && (imported.people || imported.personalExpenses)) {
          appState = { ...DEFAULT_STATE, ...imported };
          await AppStorage.saveState();
          renderPersonalExpenses();
          renderCardDivision();
          closeModal('modalBackup');
          showToast('Backup restaurado com sucesso!');
        } else {
          showToast('Arquivo de backup inválido');
        }
      } catch (err) {
        showToast('Erro ao ler o arquivo');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('btnResetAll').addEventListener('click', async () => {
    if (confirm('Tem certeza que deseja apagar absolutamente todos os dados?')) {
      appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      await AppStorage.saveState();
      renderPersonalExpenses();
      renderCardDivision();
      closeModal('modalBackup');
      showToast('Dados reiniciados');
    }
  });

  // Fechamento de Modais
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  });

  // 12. Registro do Service Worker (Offline PWA)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker registrado com sucesso.'))
        .catch(err => console.log('Falha ao registrar Service Worker:', err));
    });
  }

  // 13. Auto-save antes de fechar ou minimizar app no celular
  window.addEventListener('beforeunload', () => AppStorage.saveState());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      AppStorage.saveState();
    }
  });
});

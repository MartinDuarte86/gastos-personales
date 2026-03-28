    function showToast(message, isError = false) {
      const toast = document.createElement('div');
      toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
      toast.textContent = message;
      document.body.appendChild(toast);
      
      requestAnimationFrame(() => toast.classList.add('show'));
      
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

const state = {
      token: null,
      username: null,
      tasks: [],
      teams: [],
      filterCategories: [],
      filterAssignee: 'Todos',
      selectedSidebarTeamId: '',
      searchQuery: '',
      editingTaskId: null,
      categoryColors: {},
      currentView: 'auth',
      calendarDate: new Date(),
      expenses: [],
      expensesUser: localStorage.getItem('expensesUser') || '',
      editingExpenseId: null,
    };

    const authPanel = document.getElementById('authPanel');
    const authForm = document.getElementById('authForm');
    const authUsernameInput = document.getElementById('authUsername');
    const authPasswordInput = document.getElementById('authPassword');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authToggleModeBtn = document.getElementById('authToggleModeBtn');
    const authTitle = document.getElementById('authTitle');
    const authError = document.getElementById('authError');
    const logoutBtn = document.getElementById('logoutBtn');
    let isRegisterMode = false;

    const searchInput = document.getElementById('searchInput');
    const assigneeFilter = document.getElementById('assigneeFilter');
    const darkModeBtn = document.getElementById('darkModeBtn');
    const icon = (key, fallback = '') =>
      (typeof window.resolveAppIcon === 'function' ? window.resolveAppIcon(key, fallback) : fallback);
    const taskForm = document.getElementById('taskForm');
    const taskModal = document.getElementById('taskModal');
    const fabAddBtn = document.getElementById('fabAddBtn');
    const filterList = document.getElementById('filterList');
    const backlogList = document.getElementById('backlogList');
    const inProgressZone = document.getElementById('inProgressZone');
    const quadrantEls = Array.from(document.querySelectorAll('.quadrant'));
    const BACKLOG = 'backlog';
    const IN_PROGRESS = 'en_progreso';
    const titleInput = document.getElementById('title');
    const descriptionInput = document.getElementById('description');
    const teamIdInput = document.getElementById('teamId');
    const assignedInput = document.getElementById('assigned');
    const sidebarTeamSelector = document.getElementById('sidebarTeamSelector');
    const fechaInput = document.getElementById('fecha');
    const categoryInput = document.getElementById('category');
    const categoryColorInput = document.getElementById('categoryColor');
    const categorySuggestions = document.getElementById('categorySuggestions');
    const categoryColorList = document.getElementById('categoryColorList');
    const submitBtn = taskForm.querySelector('button[type="submit"]');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const matrixViewBtn = document.getElementById('matrixViewBtn');
    const calendarViewBtn = document.getElementById('calendarViewBtn');
    const matrixPanel = document.getElementById('matrixPanel');
    const calendarPanel = document.getElementById('calendarPanel');
    const calendarTitle = document.getElementById('calendarTitle');
    const calendarGrid = document.getElementById('calendarGrid');
    const calendarWeekdays = document.getElementById('calendarWeekdays');
    const calendarPrevBtn = document.getElementById('calendarPrevBtn');
    const calendarNextBtn = document.getElementById('calendarNextBtn');
    const calendarTodayBtn = document.getElementById('calendarTodayBtn');
    const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
    const historyPanel = document.getElementById('historyPanel');
    const historyList = document.getElementById('historyList');
    const historyMonthFilter = document.getElementById('historyMonthFilter');
    const expensesViewBtn = document.getElementById('expensesViewBtn');
    const expensesPanel = document.getElementById('expensesPanel');
    const expensesUserLabel = document.getElementById('expensesUserLabel');
    const changeUserBtn = document.getElementById('changeUserBtn');
    const expenseForm = document.getElementById('expenseForm');
    const expenseDesc = document.getElementById('expenseDesc');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseCategory = document.getElementById('expenseCategory');
    const expenseDate = document.getElementById('expenseDate');
    const expenseSubmitBtn = document.getElementById('expenseSubmitBtn');
    const cancelExpenseEditBtn = document.getElementById('cancelExpenseEditBtn');
    const expensesTotal = document.getElementById('expensesTotal');
    const expensesList = document.getElementById('expensesList');

    const QUADRANTS = {
      en_progreso: 'En progreso',
      hacer: 'Hacer',
      decidir: 'Decidir',
      delegar: 'Delegar',
      eliminar: 'Eliminar'
    };
    const TASK_DRAG_TYPE = 'application/x-task-id';
    const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    async function api(path, options = {}) {
      const headers = { ...options.headers };
      if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
      }
      const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
      if (!response.ok) {
        if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
          logout();
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Error de API');
      }
      return response.json();
    }

    function logout() {
      state.token = null;
      state.username = null;
      setView('auth');
    }

    async function checkSession() {
      try {
        if (typeof window.renderAppIcons === 'function') window.renderAppIcons();
        const me = await api('/api/auth/me');
        state.username = me.username;
        return true;
      } catch (_e) {
        return false;
      }
    }

    async function loadTeams() {
      try {
        state.teams = await api('/api/teams');
      } catch (e) {
        state.teams = [];
      }
      renderTeamAvatars();
    }

    async function loadTasks() {
      try {
        state.tasks = await api('/api/tasks');
        renderFilters();
        renderCategorySuggestions();
        renderCategoryColorList();
        renderBoard();
        renderCalendar();
        renderHistory();
      } catch (e) {
        console.error('[loadTasks]', e);
        showToast('Error cargando tareas', true);
      }
    }

    function renderHistory() {
      if (!historyList) return;
      historyList.innerHTML = '';
      let finished = completedTasks();
      
      if (historyMonthFilter && historyMonthFilter.value) {
        const filterVal = historyMonthFilter.value; // "YYYY-MM"
        finished = finished.filter(task => taskDateIso(task).startsWith(filterVal));
      }

      if (finished.length === 0) {
        historyList.innerHTML = '<p class="task-meta">No hay tareas completadas.</p>';
        return;
      }
      finished.forEach(task => {
        historyList.appendChild(createTaskCard(task));
      });
    }

    function normalizeCategory(value) {
      return (value || '').trim().toLowerCase();
    }

    function getUniqueCategories() {
      return [...new Set(state.tasks.map((t) => (t.category || '').trim()).filter(Boolean))];
    }

    function getUniqueAssignees() {
      return [...new Set(state.tasks.map((t) => (t.assigned || '').trim()).filter(Boolean))];
    }

    function loadCategoryColors() {
      try {
        const raw = localStorage.getItem('categoryColors');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.categoryColors = parsed;
        }
      } catch (_error) {
      }
    }

    function saveCategoryColors() {
      localStorage.setItem('categoryColors', JSON.stringify(state.categoryColors));
    }

    function isHexColor(value) {
      return /^#[0-9a-fA-F]{6}$/.test(value || '');
    }

    function hslToHex(h, s, l) {
      const sat = s / 100;
      const light = l / 100;
      const c = (1 - Math.abs(2 * light - 1)) * sat;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = light - c / 2;
      let r = 0;
      let g = 0;
      let b = 0;

      if (h < 60) [r, g, b] = [c, x, 0];
      else if (h < 120) [r, g, b] = [x, c, 0];
      else if (h < 180) [r, g, b] = [0, c, x];
      else if (h < 240) [r, g, b] = [0, x, c];
      else if (h < 300) [r, g, b] = [x, 0, c];
      else [r, g, b] = [c, 0, x];

      const toHex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function darkenHex(hex, ratio = 0.22) {
      if (!isHexColor(hex)) return '#e5d34f';
      const value = hex.slice(1);
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      const factor = Math.max(0, Math.min(1, 1 - ratio));
      const toHex = (n) => Math.round(n * factor).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function renderFilters() {
      const categories = getUniqueCategories();

      filterList.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.className = 'filter-btn' + (state.filterCategories.length === 0 ? ' active' : '');
      allBtn.type = 'button';
      allBtn.textContent = 'Todas';
      allBtn.addEventListener('click', () => {
        state.filterCategories = [];
        renderFilters();
        renderBoard();
        renderCalendar();
        renderHistory();
      });
      filterList.appendChild(allBtn);

      categories.forEach((category) => {
        const btn = document.createElement('button');
        const isActive = state.filterCategories.includes(category);
        btn.className = 'filter-btn' + (isActive ? ' active' : '');
        btn.type = 'button';
        btn.textContent = category;
        btn.addEventListener('click', () => {
          if (isActive) {
            state.filterCategories = state.filterCategories.filter(c => c !== category);
          } else {
            state.filterCategories.push(category);
          }
          renderFilters();
          renderBoard();
          renderCalendar();
          renderHistory();
        });
        filterList.appendChild(btn);
      });
    }

    function getTeamById(teamId) {
      if (!teamId) return null;
      return state.teams.find((team) => String(team.id) === String(teamId)) || null;
    }

    function getMembersForTeam(teamId) {
      const team = getTeamById(teamId);
      return team?.members || [];
    }

    function getVisibleMembers() {
      if (state.selectedSidebarTeamId) {
        return getMembersForTeam(state.selectedSidebarTeamId);
      }
      const seen = new Set();
      return state.teams.flatMap((team) =>
        (team.members || [])
          .map((m) => ({ ...m, team_id: team.id }))
          .filter((m) => {
            const key = String(m.user_id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
      );
    }

    function getTaskAssigneeName(task) {
      return (task.assigned_username || task.assigned || '').trim();
    }

    function syncTaskAssigneeOptions(selectedUserId = '') {
      if (!assignedInput) return;
      const members = teamIdInput?.value ? getMembersForTeam(teamIdInput.value) : [];
      assignedInput.innerHTML = '<option value="">Sin asignar</option>';
      members.forEach((member) => {
        const opt = document.createElement('option');
        opt.value = String(member.user_id);
        opt.textContent = member.username;
        assignedInput.appendChild(opt);
      });
      if (selectedUserId && members.some((member) => String(member.user_id) === String(selectedUserId))) {
        assignedInput.value = String(selectedUserId);
      } else {
        assignedInput.value = '';
      }
    }

    function renderTeamAvatars() {
      const teamAvatars = document.getElementById('teamAvatars');
      if (state.selectedSidebarTeamId && !state.teams.some((team) => String(team.id) === String(state.selectedSidebarTeamId))) {
        state.selectedSidebarTeamId = '';
      }
      if (sidebarTeamSelector) {
        sidebarTeamSelector.innerHTML = '<option value="">Todos los equipos</option>';
        state.teams.forEach((team) => {
          const opt = document.createElement('option');
          opt.value = String(team.id);
          opt.textContent = team.name;
          sidebarTeamSelector.appendChild(opt);
        });
        sidebarTeamSelector.value = state.selectedSidebarTeamId ? String(state.selectedSidebarTeamId) : '';
      }

      if (teamIdInput) {
        const selectedTeamValue = teamIdInput.value;
        teamIdInput.innerHTML = '<option value="">Sin equipo</option>';
        state.teams.forEach((team) => {
          const opt = document.createElement('option');
          opt.value = String(team.id);
          opt.textContent = team.name;
          teamIdInput.appendChild(opt);
        });
        if (selectedTeamValue && state.teams.some((team) => String(team.id) === String(selectedTeamValue))) {
          teamIdInput.value = String(selectedTeamValue);
        } else {
          teamIdInput.value = '';
        }
      }

      if (!teamAvatars) return;
      teamAvatars.innerHTML = '';
      const allAvatar = document.createElement('div');
      allAvatar.className = 'avatar' + (state.filterAssignee === 'Todos' ? ' active' : '');
      allAvatar.textContent = 'All';
      allAvatar.title = 'Mostrar todos';
      allAvatar.onclick = () => {
        state.filterAssignee = 'Todos';
        renderTeamAvatars();
        renderBoard();
        renderCalendar();
        renderHistory();
      };
      teamAvatars.appendChild(allAvatar);

      getVisibleMembers().forEach((member) => {
        const initials = member.username.substring(0, 2).toUpperCase();
        const avatar = document.createElement('div');
        avatar.className = 'avatar' + (state.filterAssignee === member.username ? ' active' : '');
        avatar.textContent = initials;
        avatar.title = member.username;
        avatar.onclick = () => {
          state.filterAssignee = state.filterAssignee === member.username ? 'Todos' : member.username;
          renderTeamAvatars();
          renderBoard();
          renderCalendar();
          renderHistory();
        };
        avatar.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          const teamId = member.team_id || state.selectedSidebarTeamId;
          if (!teamId) {
            showToast('Selecciona un equipo para eliminar miembros', true);
            return;
          }
          if (confirm(`¿Eliminar a ${member.username} del equipo?`)) {
            try {
              await api(`/api/teams/${teamId}/members/${member.user_id}`, { method: 'DELETE' });
              if (state.filterAssignee === member.username) state.filterAssignee = 'Todos';
              await loadTeams();
            } catch (err) {
              console.error('[deleteTeamMember]', err);
              showToast(err.message || 'No se pudo eliminar el miembro', true);
            }
          }
        });
        teamAvatars.appendChild(avatar);
      });

      syncTaskAssigneeOptions(assignedInput?.value || '');
    }

    function renderCategorySuggestions() {
      const categories = getUniqueCategories();
      categorySuggestions.innerHTML = '';
      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        categorySuggestions.appendChild(option);
      });
    }

    function renderCategoryColorList() {
      const categories = getUniqueCategories();
      categoryColorList.innerHTML = '';

      if (categories.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'task-meta';
        empty.textContent = 'No hay categorias todavia.';
        categoryColorList.appendChild(empty);
        return;
      }

      categories.forEach((category) => {
        const row = document.createElement('div');
        row.className = 'category-color-item';

        const name = document.createElement('span');
        name.className = 'category-color-name';
        name.textContent = category;

        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'category-color-input';
        input.value = getCategoryHex(category);
        input.title = `Color de ${category}`;
        input.addEventListener('input', () => {
          const normalized = normalizeCategory(category);
          state.categoryColors[normalized] = input.value;
          saveCategoryColors();
          if (normalizeCategory(categoryInput.value) === normalized) {
            categoryColorInput.value = input.value;
          }
          renderBoard();
        });

        row.appendChild(name);
        row.appendChild(input);
        categoryColorList.appendChild(row);
      });
    }

    function hashCategory(value) {
      let hash = 0;
      for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    }

    function getCategoryHex(category) {
      const normalized = normalizeCategory(category);
      if (!normalized) return '#fff28b';
      if (isHexColor(state.categoryColors[normalized])) {
        return state.categoryColors[normalized];
      }

      const baseHash = hashCategory(normalized);
      const hue = baseHash % 360;
      return hslToHex(hue, 70, 86);
    }

    function getCategoryColor(category) {
      const sticky = getCategoryHex(category);
      return {
        sticky,
        line: darkenHex(sticky)
      };
    }

    function filteredTasks() {
      let filtered = state.tasks;
      if (state.searchQuery) {
        filtered = filtered.filter((task) => {
          const title = (task.title || '').toLowerCase();
          const desc = (task.description || '').toLowerCase();
          const cat = (task.category || '').toLowerCase();
          return title.includes(state.searchQuery) || desc.includes(state.searchQuery) || cat.includes(state.searchQuery);
        });
      }
      if (state.filterCategories.length > 0) {
        filtered = filtered.filter((task) => state.filterCategories.includes((task.category || '').trim()));
      }
      if (state.filterAssignee !== 'Todos') {
        filtered = filtered.filter((task) => getTaskAssigneeName(task) === state.filterAssignee);
      }
      return filtered;
    }

    function activeTasks() {
      return filteredTasks().filter((task) => !task.completed);
    }

    function completedTasks() {
      return filteredTasks().filter((task) => task.completed);
    }

    const appSidebar = document.getElementById('appSidebar');

    function setView(view) {
      state.currentView = view;
      const isAuth = view === 'auth';
      const isMatrix = view === 'matrix';
      const isCalendar = view === 'calendar';
      const isHistory = view === 'history';
      const isExpenses = view === 'expenses';
      const isInversiones = view === 'inversiones';
      const isPresupuesto = view === 'presupuesto';
      const isTareasTab = isMatrix || isHistory;
      
      const mainAppMenu = document.querySelector('.view-switch');
      if (authPanel) authPanel.hidden = !isAuth;
      if (mainAppMenu) mainAppMenu.hidden = isAuth;
      if (logoutBtn) logoutBtn.hidden = isAuth;
      
      matrixPanel.hidden = !isMatrix;
      calendarPanel.hidden = !isCalendar;
      if (historyPanel) historyPanel.hidden = !isHistory;
      if (expensesPanel) expensesPanel.hidden = !isExpenses;
      const inversionesPanel = document.getElementById('inversionesPanel');
      if (inversionesPanel) inversionesPanel.hidden = !isInversiones;
      const presupuestoPanel = document.getElementById('presupuestoPanel');
      if (presupuestoPanel) presupuestoPanel.hidden = !isPresupuesto;
      
      matrixViewBtn.classList.toggle('active', isTareasTab);
      calendarViewBtn.classList.toggle('active', isCalendar);
      if (toggleHistoryBtn) toggleHistoryBtn.classList.toggle('active', isHistory);
      if (expensesViewBtn) expensesViewBtn.classList.toggle('active', isExpenses);
      const invViewBtn = document.getElementById('invViewBtn');
      if (invViewBtn) invViewBtn.classList.toggle('active', isInversiones);
      const presupuestoViewBtn = document.getElementById('presupuestoViewBtn');
      if (presupuestoViewBtn) presupuestoViewBtn.classList.toggle('active', isPresupuesto);

      if (appSidebar) appSidebar.hidden = isAuth ? true : !isTareasTab;
      if (taskForm) taskForm.hidden = isAuth ? true : !isTareasTab;
      if (fabAddBtn) fabAddBtn.hidden = isAuth ? true : !isMatrix;

      if (isExpenses && typeof checkExpensesUser === 'function') {
        checkExpensesUser();
      }
      if (isInversiones && typeof loadInversionesData === 'function') {
        loadInversionesData();
      }
      if (isPresupuesto && window._budgetDashboard) {
        window._budgetDashboard.refresh();
      }
    }

    function dateToIso(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    function taskDateIso(task) {
      const norm = normalizeFechaInput(task.fecha);
      return norm ? norm.slice(0, 10) : '';
    }

    function moveCalendarMonth(offset) {
      const next = new Date(state.calendarDate.getTime());
      next.setDate(1);
      next.setMonth(next.getMonth() + offset);
      state.calendarDate = next;
      renderCalendar();
    }

    function setupWeekdays() {
      calendarWeekdays.innerHTML = '';
      WEEKDAYS.forEach((name) => {
        const el = document.createElement('div');
        el.className = 'calendar-weekday';
        el.textContent = name;
        calendarWeekdays.appendChild(el);
      });
    }

    function createCalendarDayCell(baseDate, currentMonth, todayIso, tasksByDate) {
      const cell = document.createElement('article');
      const cellIso = dateToIso(baseDate);
      const isOutside = baseDate.getMonth() !== currentMonth;
      const isToday = cellIso === todayIso;
      cell.className = `calendar-day${isOutside ? ' outside-month' : ''}${isToday ? ' today' : ''}`;

      const number = document.createElement('p');
      number.className = 'calendar-day-number';
      number.textContent = String(baseDate.getDate());
      cell.appendChild(number);

      const tasksWrap = document.createElement('div');
      tasksWrap.className = 'calendar-day-tasks';
      const dayTasks = tasksByDate.get(cellIso) || [];
      const visibleTasks = dayTasks.slice(0, 3);

      visibleTasks.forEach((task) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'calendar-task';
        item.draggable = true;
        item.title = task.title || '(Sin titulo)';
        const colors = getCategoryColor(task.category || '');
        item.style.setProperty('--task-sticky', colors.sticky);
        item.style.setProperty('--task-sticky-line', colors.line);
        item.textContent = task.title || '(Sin titulo)';
        item.addEventListener('dragstart', (event) => {
          setDragTask(event, task.id);
        });
        item.addEventListener('click', () => {
          state.editingTaskId = task.id;
          titleInput.value = task.title || '';
          descriptionInput.value = task.description || '';
          teamIdInput.value = task.team_id ? String(task.team_id) : '';
          syncTaskAssigneeOptions(task.assigned_user_id ? String(task.assigned_user_id) : '');
          fechaInput.value = normalizeFechaInput(task.fecha);
          categoryInput.value = task.category || '';
          categoryColorInput.value = getCategoryHex(task.category || '');
          submitBtn.textContent = 'Modificar tarea';
          cancelEditBtn.hidden = false;
          titleInput.focus();
          taskForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        tasksWrap.appendChild(item);
      });

      if (dayTasks.length > visibleTasks.length) {
        const extra = document.createElement('p');
        extra.className = 'task-meta';
        extra.textContent = `+${dayTasks.length - visibleTasks.length} mas`;
        tasksWrap.appendChild(extra);
      }

      setupCalendarDayDropZone(cell, cellIso);
      cell.appendChild(tasksWrap);
      return cell;
    }

    function renderCalendar() {
      const monthDate = new Date(state.calendarDate.getTime());
      monthDate.setDate(1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      calendarTitle.textContent = `${MONTHS[month]} ${year}`;

      const monthTasks = activeTasks().filter((task) => taskDateIso(task));
      const tasksByDate = new Map();
      monthTasks.forEach((task) => {
        const iso = taskDateIso(task);
        if (!tasksByDate.has(iso)) {
          tasksByDate.set(iso, []);
        }
        tasksByDate.get(iso).push(task);
      });

      const firstWeekDay = monthDate.getDay();
      const gridStart = new Date(year, month, 1 - firstWeekDay);
      const todayIso = dateToIso(new Date());
      calendarGrid.innerHTML = '';

      for (let i = 0; i < 42; i += 1) {
        const current = new Date(gridStart.getTime());
        current.setDate(gridStart.getDate() + i);
        calendarGrid.appendChild(createCalendarDayCell(current, month, todayIso, tasksByDate));
      }

    }

    function resetEditMode() {
      state.editingTaskId = null;
      taskForm.reset();
      if (teamIdInput) teamIdInput.value = '';
      syncTaskAssigneeOptions('');
      fechaInput.value = '';
      if (categoryColorInput) categoryColorInput.value = '#fff28b';
      if (document.getElementById('formQuadrant')) document.getElementById('formQuadrant').disabled = false;
      submitBtn.textContent = 'Guardar tarea';
      cancelEditBtn.hidden = false;
      if (taskModal && taskModal.open) taskModal.close();
    }

    function createTaskCard(task) {
      const card = document.createElement('article');
      card.className = 'task';
      card.draggable = true;
      card.dataset.id = String(task.id);

      const title = task.title || '(Sin titulo)';
      const category = (task.category || 'Sin categoria').trim() || 'Sin categoria';
      const assigned = getTaskAssigneeName(task) || 'Sin asignar';
      const teamName = (task.team_name || '').trim() || 'Sin equipo';
      const fecha = formatFecha(task.fecha);
      const trackedSeconds = getTaskInProgressSeconds(task);
      const hadInProgress = Number(task.ever_in_progress || 0) === 1 || trackedSeconds > 0 || Boolean(task.in_progress_started_at);
      const inProgressLabel = hadInProgress ? ` | Tiempo en proceso: ${formatInProgressDuration(trackedSeconds)}` : '';
      const colors = getCategoryColor(task.category || '');
      card.style.setProperty('--task-sticky', colors.sticky);
      card.style.setProperty('--task-sticky-line', colors.line);

      card.innerHTML = `
        <div class="task-top">
          <div class="task-title-wrap">
            <button class="complete-btn" title="Marcar como completada" type="button">
              ${task.completed ? '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>' : ''}
            </button>
            <h4 class="task-title ${task.completed ? 'completed' : ''}">${escapeHtml(title)}</h4>
          </div>
          <div class="task-actions">
            <button class="task-action-btn edit-btn" type="button" aria-label="Editar tarea">Editar</button>
            <button class="task-action-btn delete-btn" type="button" aria-label="Eliminar tarea">x</button>
          </div>
        </div>
        <div class="task-meta">
          <p style="margin:0;">Categoria: ${escapeHtml(category)} | Equipo: ${escapeHtml(teamName)} | Asignado: ${escapeHtml(assigned)} | Fecha: ${escapeHtml(fecha)}${escapeHtml(inProgressLabel)}</p>
        </div>
      `;

      const completeBtn = card.querySelector('.complete-btn');
      if (completeBtn && !task.completed) {
        completeBtn.addEventListener('click', async () => {
          completeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
          card.classList.add('completed-animation');
          setTimeout(async () => {
            await api(`/api/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ completed: 1 })
            });
            await loadTasks();
          }, 500);
        });
      } else if (completeBtn && task.completed) {
        completeBtn.addEventListener('click', async () => {
          await api(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: 0 })
          });
          await loadTasks();
        });
      }

      card.querySelector('.edit-btn').addEventListener('click', () => {
        state.editingTaskId = task.id;
        titleInput.value = task.title || '';
        descriptionInput.value = task.description || '';
        teamIdInput.value = task.team_id ? String(task.team_id) : '';
        syncTaskAssigneeOptions(task.assigned_user_id ? String(task.assigned_user_id) : '');
        fechaInput.value = normalizeFechaInput(task.fecha);
        categoryInput.value = task.category || '';
        if (categoryColorInput) categoryColorInput.value = getCategoryHex(task.category || '');
        if (document.getElementById('formQuadrant')) document.getElementById('formQuadrant').disabled = true;
        submitBtn.textContent = 'Modificar tarea';
        cancelEditBtn.hidden = false;
        titleInput.focus();
        if (taskModal) taskModal.showModal();
        else taskForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      card.querySelector('.delete-btn').addEventListener('click', async () => {
        try {
          await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
          if (state.editingTaskId === task.id) {
            resetEditMode();
          }
          await loadTasks();
        } catch (e) {
          console.error('[deleteTask]', e);
          showToast('No se pudo eliminar la tarea', true);
        }
      });

      card.addEventListener('dragstart', (event) => {
        card.classList.add('dragging');
        setDragTask(event, task.id);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      return card;
    }

    function setDragTask(event, taskId) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(TASK_DRAG_TYPE, String(taskId));
      event.dataTransfer.setData('text/plain', String(taskId));
    }

    function getDraggedTaskId(event) {
      return event.dataTransfer.getData(TASK_DRAG_TYPE) || event.dataTransfer.getData('text/plain');
    }

    async function updateTaskFecha(taskId, fecha) {
      await api(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha })
      });
    }

    function setupCalendarDayDropZone(dayEl, cellIso) {
      dayEl.addEventListener('dragover', (event) => {
        event.preventDefault();
        dayEl.classList.add('drag-over');
      });

      dayEl.addEventListener('dragleave', () => {
        dayEl.classList.remove('drag-over');
      });

      dayEl.addEventListener('drop', async (event) => {
        event.preventDefault();
        dayEl.classList.remove('drag-over');

        const id = getDraggedTaskId(event);
        if (!id) return;

        const task = state.tasks.find((item) => String(item.id) === String(id));
        if (!task) return;

        const currentFecha = taskDateIso(task);
        if (currentFecha === cellIso) return;

        let newFecha = cellIso;
        const oldNorm = normalizeFechaInput(task.fecha);
        if (oldNorm.length > 10) {
          newFecha = `${cellIso}T${oldNorm.slice(11, 16)}`;
        }

        await updateTaskFecha(id, newFecha);

        if (String(state.editingTaskId) === String(id)) {
          fechaInput.value = newFecha;
        }

        await loadTasks();
      });
    }

    function renderBoard() {
      quadrantEls.forEach((quadrantEl) => {
        const key = quadrantEl.dataset.quadrant;
        quadrantEl.innerHTML = `<h3>${QUADRANTS[key]}</h3>`;
      });
      if (inProgressZone) {
        inProgressZone.innerHTML = `<h3>${QUADRANTS[IN_PROGRESS]}</h3><p class="drop-hint">Arrastra aqui las tareas que estas trabajando</p>`;
      }
      backlogList.innerHTML = '';
      let inProgressCount = 0;

      activeTasks().forEach((task) => {
        if (task.quadrant === BACKLOG) {
          backlogList.appendChild(createTaskCard(task));
          return;
        }
        if (task.quadrant === IN_PROGRESS && inProgressZone) {
          inProgressZone.appendChild(createTaskCard(task));
          inProgressCount += 1;
          return;
        }

        const column = document.querySelector(`.quadrant[data-quadrant="${task.quadrant}"]`);
        if (!column) return;
        column.appendChild(createTaskCard(task));
      });

      if (inProgressZone) {
        const hint = inProgressZone.querySelector('.drop-hint');
        if (hint) hint.hidden = inProgressCount > 0;
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function normalizeFechaInput(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      return raw.slice(0, 16);
    }

    function formatFecha(value) {
      const normalized = normalizeFechaInput(value);
      if (!normalized) return 'Sin fecha';
      const datePart = normalized.slice(0, 10);
      const timePart = normalized.slice(11, 16);
      const [year, month, day] = datePart.split('-');
      if (!year || !month || !day) return normalized;
      
      if (timePart) {
        return `${day}/${month}/${year} ${timePart}`;
      }
      return `${day}/${month}/${year}`;
    }

    function getTaskInProgressSeconds(task) {
      const base = Number(task.in_progress_seconds || 0);
      const startedAt = task.in_progress_started_at;
      if (!startedAt) return Math.max(0, Math.floor(base));
      const startedMs = Date.parse(startedAt);
      if (!Number.isFinite(startedMs)) return Math.max(0, Math.floor(base));
      const running = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
      return Math.max(0, Math.floor(base) + running);
    }

    function formatInProgressDuration(totalSeconds) {
      const minutes = Math.max(0, Math.floor(totalSeconds / 60));
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${minutes} min`;
    }

    taskForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const title = titleInput.value.trim();
      const description = descriptionInput.value.trim();
      const teamId = teamIdInput?.value ? Number(teamIdInput.value) : null;
      const assignedUserId = assignedInput?.value ? Number(assignedInput.value) : null;
      const assignedMember = teamId ? getMembersForTeam(teamId).find((member) => Number(member.user_id) === Number(assignedUserId)) : null;
      const assigned = assignedMember?.username || '';
      const fecha = normalizeFechaInput(fechaInput.value);
      const category = categoryInput.value.trim();

      if (!title) return;

      try {
        const normalizedCategory = normalizeCategory(category);
        if (categoryColorInput && normalizedCategory && isHexColor(categoryColorInput.value)) {
          state.categoryColors[normalizedCategory] = categoryColorInput.value;
          saveCategoryColors();
        }

        let targetQuadrant = document.getElementById('formQuadrant') ? document.getElementById('formQuadrant').value : BACKLOG;

        if (state.editingTaskId) {
          const editingTask = state.tasks.find((task) => String(task.id) === String(state.editingTaskId));
          try {
            await api(`/api/tasks/${state.editingTaskId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                description,
                assigned,
                fecha,
                category,
                team_id: teamId,
                assigned_user_id: assignedUserId
              })
            });
          } catch (_patchError) {
            // Fallback para servidores sin soporte PATCH: recrea y elimina original.
            if (!editingTask) throw _patchError;
            await api('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                description,
                assigned,
                fecha,
                category,
                team_id: teamId,
                assigned_user_id: assignedUserId,
                quadrant: editingTask.quadrant || BACKLOG
              })
            });
            await api(`/api/tasks/${state.editingTaskId}`, { method: 'DELETE' });
          }
        } else {
          await api('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              description,
              quadrant: targetQuadrant,
              assigned,
              fecha,
              category,
              team_id: teamId,
              assigned_user_id: assignedUserId
            })
          });
        }

        resetEditMode();
        await loadTasks();
        showToast('Tarea guardada correctamente');
      } catch (error) {
        console.error(error);
        showToast('No se pudo guardar la tarea', true);
      }
    });

    cancelEditBtn.addEventListener('click', () => {
      resetEditMode();
    });

    if (categoryColorInput) {
      categoryInput.addEventListener('input', () => {
        categoryColorInput.value = getCategoryHex(categoryInput.value);
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderBoard();
        renderCalendar();
        renderHistory();
      });
    }

    matrixViewBtn.addEventListener('click', () => {
      setView('matrix');
    });

    if (darkModeBtn) {
      if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeBtn.innerHTML = icon('darkModeSun', '&#x2600;&#xFE0F;');
      }
      darkModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark);
        darkModeBtn.innerHTML = isDark ? icon('darkModeSun', '&#x2600;&#xFE0F;') : icon('darkModeMoon', '&#x1F319;');
      });
    }

    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();
        authError.textContent = '';
        if (!username || !password) return;

        try {
          const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
          const res = await api(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          state.token = res.token || null;
          state.username = res.username;
          authForm.reset();
          setView('matrix');
          await loadTeams();
          await loadTasks();
        } catch (err) {
          authError.textContent = err.message;
        }
      });
    }

    if (authToggleModeBtn) {
      authToggleModeBtn.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        authTitle.textContent = isRegisterMode ? 'Registrar Usuario' : 'Iniciar Sesión';
        authSubmitBtn.textContent = isRegisterMode ? 'Registrarse' : 'Ingresar';
        authToggleModeBtn.textContent = isRegisterMode ? 'Ya tengo cuenta (Ingresar)' : 'No tengo cuenta (Registrarme)';
        authError.textContent = '';
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await api('/api/auth/logout', { method: 'POST' });
        } catch(e) {
          console.warn('[logout] Server-side logout failed (proceeding anyway):', e.message);
        }
        logout();
      });
    }

    calendarViewBtn.addEventListener('click', () => {
      setView('calendar');
    });

    if (toggleHistoryBtn) {
      toggleHistoryBtn.addEventListener('click', () => {
        if (state.currentView === 'history') {
          setView('matrix');
        } else {
          setView('history');
        }
      });
    }

    if (fabAddBtn && taskModal) {
      fabAddBtn.addEventListener('click', () => {
        resetEditMode();
        taskModal.showModal();
      });
    }
    
    if (historyMonthFilter) {
      historyMonthFilter.addEventListener('change', renderHistory);
    }

    if (sidebarTeamSelector) {
      sidebarTeamSelector.addEventListener('change', (e) => {
        state.selectedSidebarTeamId = e.target.value || '';
        state.filterAssignee = 'Todos';
        renderTeamAvatars();
        renderBoard();
        renderCalendar();
        renderHistory();
      });
    }

    if (teamIdInput) {
      teamIdInput.addEventListener('change', () => {
        syncTaskAssigneeOptions('');
      });
    }

    const addTeamForm = document.getElementById('addTeamForm');
    if (addTeamForm) {
      addTeamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('newTeamName');
        const name = input?.value.trim();
        if (!name) return;
        try {
          await api('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
          input.value = '';
          await loadTeams();
        } catch (err) { showToast(err.message, true); }
      });
    }

    const addTeamMemberForm = document.getElementById('addTeamMemberForm');
    if (addTeamMemberForm) {
      addTeamMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('newTeamMemberUsername');
        const username = usernameInput?.value.trim();
        const selectedTeamId = state.selectedSidebarTeamId || '';
        if (!selectedTeamId) {
          showToast('Selecciona un equipo para agregar miembros', true);
          return;
        }
        if (!username) return;
        try {
          await api(`/api/teams/${selectedTeamId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          usernameInput.value = '';
          await loadTeams();
        } catch (err) {
          showToast(err.message, true);
        }
      });
    }
    
    const addCategoryForm = document.getElementById('addCategoryForm');
    if (addCategoryForm) {
      addCategoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('newCategoryName').value.trim();
        const color = document.getElementById('newCategoryColor').value;
        if (name && isHexColor(color)) {
          state.categoryColors[normalizeCategory(name)] = color;
          saveCategoryColors();
          document.getElementById('newCategoryName').value = '';
          renderCategoryColorList();
          renderBoard();
        }
      });
    }

    expensesViewBtn?.addEventListener('click', () => {
      setView('expenses');
    });

    calendarPrevBtn.addEventListener('click', () => moveCalendarMonth(-1));
    calendarNextBtn.addEventListener('click', () => moveCalendarMonth(1));
    calendarTodayBtn.addEventListener('click', () => {
      state.calendarDate = new Date();
      renderCalendar();
    });

    function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('.task:not(.dragging)')];
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function setupDropZone(zoneEl, getQuadrant) {
      zoneEl.addEventListener('dragover', (event) => {
        event.preventDefault();
        zoneEl.classList.add('drag-over');
        const afterElement = getDragAfterElement(zoneEl, event.clientY);
        const draggable = document.querySelector('.dragging');
        if (draggable) {
          if (afterElement == null) {
            zoneEl.appendChild(draggable);
          } else {
            zoneEl.insertBefore(draggable, afterElement);
          }
        }
      });

      zoneEl.addEventListener('dragleave', () => {
        zoneEl.classList.remove('drag-over');
      });

      zoneEl.addEventListener('drop', async (event) => {
        event.preventDefault();
        zoneEl.classList.remove('drag-over');

        const id = getDraggedTaskId(event);
        const quadrant = getQuadrant();
        if (!id || !quadrant) return;

        try {
          await api(`/api/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quadrant })
          });

          const cards = [...zoneEl.querySelectorAll('.task')];
          const orderedTasks = cards.map(c => ({ id: Number(c.dataset.id) }));
          if (orderedTasks.length > 0) {
            await api('/api/tasks/reorder', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tasks: orderedTasks })
            });
          }

          await loadTasks();
        } catch (err) {
          console.error('[dragDrop]', err);
          showToast('Error al mover la tarea', true);
          await loadTasks(); // Revert UI to server state
        }
      });
    }

    quadrantEls.forEach((quadrantEl) => {
      setupDropZone(quadrantEl, () => quadrantEl.dataset.quadrant);
    });
    if (inProgressZone) {
      setupDropZone(inProgressZone, () => IN_PROGRESS);
    }
    setupDropZone(backlogList, () => BACKLOG);

    setInterval(() => {
      if (state.currentView !== 'matrix') return;
      const hasRunningTask = state.tasks.some((task) => !task.completed && task.in_progress_started_at);
      if (hasRunningTask) renderBoard();
    }, 60 * 1000);

    // --- INVERSIONES LOGIC ---
    let invState = {
      posiciones: [],
      dolarMep: 0,
      moneda: 'ARS',
      activos: [],
      sectores: [],
      sectorFilter: 'Todos'
    };
    let invSectorChartInstance = null;
    let invActivoChartInstance = null;
    let globalsHeader = null;
    let sectorView = null;

    const invViewBtnApp = document.getElementById('invViewBtn');
    if (invViewBtnApp) {
      invViewBtnApp.addEventListener('click', () => setView('inversiones'));
    }



    const invTabsBtns = document.querySelectorAll('.inv-tab-btn');
    const invTabContents = document.querySelectorAll('.inv-tab-content');
    invTabsBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        invTabsBtns.forEach(b => b.classList.remove('active'));
        invTabContents.forEach(c => c.hidden = true);
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.hidden = false;
        
        if (targetId === 'invGraficosTab') renderInvCharts();
      });
    });

    const invNewActivoBtn = document.getElementById('invNewActivoBtn');
    const invCancelActivoBtn = document.getElementById('invCancelActivoBtn');
    const invTransaccionForm = document.getElementById('invTransaccionForm');
    const invActivoForm = document.getElementById('invActivoForm');

    if (invNewActivoBtn) {
      invNewActivoBtn.addEventListener('click', () => {
        invTransaccionForm.hidden = true;
        invActivoForm.hidden = false;
        invActivoForm.reset();
      });
    }
    if (invCancelActivoBtn) {
      invCancelActivoBtn.addEventListener('click', () => {
        invActivoForm.hidden = true;
        invTransaccionForm.hidden = false;
      });
    }

    async function loadInversionesData() {
      try {
        const [portRes, actRes, sectRes, liqRes] = await Promise.all([
          api('/api/inv/portfolio'),
          api('/api/inv/activos'),
          api('/api/inv/sectores'),
          api('/api/presupuesto/liquidez-inversion').catch(() => ({ bruta: 0, descuentos: 0, neta: 0 }))
        ]);
        invState.posiciones = portRes.posiciones || [];
        invState.dolarMep = portRes.dolar_mep || 0;
        invState.activos = actRes || [];
        invState.sectores = sectRes || [];
        
        const formatMoney = (val) => '$ ' + Number(val || 0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
        const elBruta = document.getElementById('invLiquidezBruta');
        const elDesc = document.getElementById('invLiquidezDescuentos');
        const elNeta = document.getElementById('invLiquidezNeta');
        if (elBruta) elBruta.textContent = formatMoney(liqRes.bruta);
        if (elDesc) elDesc.textContent = formatMoney(liqRes.descuentos);
        if (elNeta) elNeta.textContent = formatMoney(liqRes.neta);
        
        if (!globalsHeader) {
          globalsHeader = new window.GlobalSummaryHeader({
            moneda: invState.moneda,
            dolarMep: invState.dolarMep,
            posiciones: invState.posiciones
          }, (newMoneda) => {
            invState.moneda = newMoneda;
            renderInvPosiciones();
          });
          
          sectorView = new window.SectorDetailView('invList', {
            onActionClick: (id_activo) => {
              if (typeof openLedger === 'function') openLedger(id_activo);
            }
          });
        } else {
          globalsHeader.update({
            dolarMep: invState.dolarMep,
            posiciones: invState.posiciones
          });
        }

        populateInvSelects();
        renderInvFilters();
        renderInvPosiciones();
      } catch (err) {
        console.error(err);
        showToast('Error cargando inversiones', true);
      }
    }

    function populateInvSelects() {
      const invTxActivo = document.getElementById('invTxActivo');
      const invSectorSuggestions = document.getElementById('invSectorSuggestions');
      if (invTxActivo) {
        invTxActivo.innerHTML = '<option value="">Seleccione Activo...</option>';
        invState.activos.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.id_activo;
          opt.dataset.clase = a.clase || '';
          opt.textContent = `${a.ticker} - ${a.nombre || a.clase}`;
          invTxActivo.appendChild(opt);
        });
      }
      if (invTxActivo) {
        invTxActivo.addEventListener('change', (e) => {
          const opt = e.target.options[e.target.selectedIndex];
          const clase = opt?.dataset?.clase || '';
          const tnaInput = document.getElementById('invTxTna');
          if (tnaInput) {
            if (clase === 'Plazo Fijo' || clase === 'Caución' || clase === 'CauciÃ³n') {
              tnaInput.hidden = false;
              tnaInput.required = true;
            } else {
              tnaInput.hidden = true;
              tnaInput.required = false;
              tnaInput.value = '';
            }
          }
        });
      }
      if (invSectorSuggestions) {
        invSectorSuggestions.innerHTML = '';
        invState.sectores.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.nombre;
          invSectorSuggestions.appendChild(opt);
        });
      }
    }

    function renderInvFilters() {
      const filtersList = document.getElementById('invFiltersList');
      if (!filtersList) return;
      filtersList.innerHTML = '';
      
      const allBtn = document.createElement('button');
      allBtn.className = 'filter-btn' + (invState.sectorFilter === 'Todos' ? ' active' : '');
      allBtn.textContent = 'Todos';
      allBtn.onclick = () => { invState.sectorFilter = 'Todos'; renderInvPosiciones(); renderInvFilters(); };
      filtersList.appendChild(allBtn);

      invState.sectores.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn' + (invState.sectorFilter === s.nombre ? ' active' : '');
        btn.textContent = s.nombre;
        btn.onclick = () => { invState.sectorFilter = s.nombre; renderInvPosiciones(); renderInvFilters(); };
        filtersList.appendChild(btn);
      });
    }

    function renderInvPosiciones() {
      const list = document.getElementById('invList');
      if (!list) return;
      list.innerHTML = '';

      const getConverted = (amount, monedaOrigen) => {
        if (invState.moneda === monedaOrigen) return amount;
        if (!invState.dolarMep) return amount;
        if (invState.moneda === 'USD' && monedaOrigen === 'ARS') return amount / invState.dolarMep;
        if (invState.moneda === 'ARS' && monedaOrigen === 'USD') return amount * invState.dolarMep;
        return amount;
      };

      const formatCurrency = (val) => {
        return (invState.moneda === 'USD' ? 'u$s ' : '$ ') + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // 1. Calculate Global Totals (delegated to GlobalSummaryHeader)
      if (globalsHeader) {
        globalsHeader.update({ posiciones: invState.posiciones });
      }

      // 2. Filter for List & Sector Stats (delegated to SectorDetailView)
      if (typeof window.sectorView === 'undefined') {
        window.sectorView = new window.SectorDetailView('invList', {
          onActionClick: async (activoId) => {
             if (typeof window.LedgerModal !== 'undefined') {
               try {
                 if (!window.ledgerModalInstance) {
                   window.ledgerModalInstance = new window.LedgerModal('invLedgerModal');
                 }
                 const transacciones = await api('/api/inv/transacciones');
                 window.ledgerModalInstance.open(activoId, transacciones, invState);
               } catch (err) {
                 showToast('Error cargando historial', true);
               }
             } else {
                 console.error("LedgerModal is undefined. Please hard refresh.");
                 showToast('Error: Recargá la página sin caché (Ctrl+Shift+R)', true);
             }
          }
        });
      }
      
      if (globalsHeader) {
        const { totalActual } = globalsHeader.calculateTotals();
        window.sectorView.update({
          posiciones: invState.posiciones,
          sectorFilter: invState.sectorFilter,
          moneda: invState.moneda,
          dolarMep: invState.dolarMep,
          globalActual: totalActual
        });
      }

      if (document.getElementById('invGraficosTab') && !document.getElementById('invGraficosTab').hidden) {
        renderInvCharts();
      }
    }

    function renderInvCharts() {
      if (typeof Chart === 'undefined') return;

      const getConverted = (amount, monedaOrigen) => {
        if (invState.moneda === monedaOrigen) return amount;
        if (!invState.dolarMep) return amount;
        if (invState.moneda === 'USD' && monedaOrigen === 'ARS') return amount / invState.dolarMep;
        if (invState.moneda === 'ARS' && monedaOrigen === 'USD') return amount * invState.dolarMep;
        return amount;
      };

      const bySector = {};
      const byActivo = {};

      invState.posiciones.forEach(p => {
        const actConv = getConverted(p.cantidad_total * p.precio_mercado, p.moneda_operacion);
        if (actConv <= 0) return;
        const sec = p.sector || 'Sin sector';
        const tic = p.ticker;
        bySector[sec] = (bySector[sec] || 0) + actConv;
        byActivo[tic] = (byActivo[tic] || 0) + actConv;
      });

      const sectorLabels = Object.keys(bySector);
      const sectorData = Object.values(bySector);
      const activoLabels = Object.keys(byActivo);
      const activoData = Object.values(byActivo);

      const isDark = document.body.classList.contains('dark-mode');
      const textColor = isDark ? '#f8fafc' : '#111827';
      const chartOptions = {
        responsive: true,
        plugins: {
          legend: { position: 'right', labels: { color: textColor } },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.label || '';
                if (label) { label += ': '; }
                if (context.parsed !== null) {
                  label += (invState.moneda === 'USD' ? 'u$s ' : '$ ') + context.parsed.toLocaleString('en-US', {minimumFractionDigits:2});
                }
                return label;
              }
            }
          }
        }
      };

      const bgColors = [
        '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#3b82f6', '#84cc16'
      ];

      const ctxSector = document.getElementById('invSectorChart');
      if (ctxSector) {
        if (invSectorChartInstance) invSectorChartInstance.destroy();
        invSectorChartInstance = new Chart(ctxSector, {
          type: 'pie',
          data: {
            labels: sectorLabels,
            datasets: [{ data: sectorData, backgroundColor: bgColors, borderWidth: isDark ? 0 : 2 }]
          },
          options: chartOptions
        });
      }

      const ctxActivo = document.getElementById('invActivoChart');
      if (ctxActivo) {
        if (invActivoChartInstance) invActivoChartInstance.destroy();
        invActivoChartInstance = new Chart(ctxActivo, {
          type: 'doughnut',
          data: {
            labels: activoLabels,
            datasets: [{ data: activoData, backgroundColor: bgColors, borderWidth: isDark ? 0 : 2 }]
          },
          options: chartOptions
        });
      }
    }

    if (invActivoForm) {
      const tickerInput = document.getElementById('invActTicker');
      const badge = document.getElementById('invActTickerBadge');
      const providerInput = document.getElementById('invActProvider');
      const providerIdInput = document.getElementById('invActProviderId');
      
      let debounceTimer;
      if (tickerInput) {
        tickerInput.addEventListener('input', (e) => {
          const val = e.target.value.trim().toUpperCase();
          if (!val) {
            if (badge) badge.style.display = 'none';
            if (providerInput) {
              providerInput.value = 'manual';
              providerInput.disabled = false;
            }
            if (providerIdInput) {
              providerIdInput.value = '';
              providerIdInput.disabled = true;
            }
            return;
          }
          
          if (badge) {
            badge.style.display = 'flex';
            badge.className = 'badge';
            badge.style.background = '#f3f4f6';
            badge.style.color = '#4b5563';
            badge.style.border = '1px solid var(--line)';
            badge.style.borderLeft = 'none';
            badge.style.borderTopLeftRadius = '0';
            badge.style.borderBottomLeftRadius = '0';
            badge.innerHTML = `${icon('hourglass', '&#x23F3;')} ...`;
          }
          
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            try {
              const res = await api(`/api/inv/validate/${encodeURIComponent(val)}`);
              if (res.valid) {
                if (badge) {
                  badge.className = 'badge badge-auto';
                  badge.style.background = '';
                  badge.style.color = '';
                  badge.style.border = '';
                  badge.innerHTML = `${icon('greenCircle', '&#x1F7E2;')} Auto`;
                }
                if (providerInput) {
                   providerInput.value = 'yahoo';
                   providerInput.disabled = true;
                }
                if (providerIdInput) {
                   providerIdInput.value = val;
                   providerIdInput.disabled = false;
                }
              }
            } catch (err) {
              if (badge) {
                badge.className = 'badge badge-manual';
                badge.style.background = '';
                badge.style.color = '';
                badge.style.border = '';
                badge.innerHTML = `${icon('redCircle', '&#x1F534;')} Manual`;
              }
              if (providerInput) {
                 providerInput.value = 'manual';
                 providerInput.disabled = false;
              }
              if (providerIdInput) {
                 providerIdInput.value = '';
                 providerIdInput.disabled = true;
              }
            }
          }, 800);
        });
      }

      invActivoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticker = document.getElementById('invActTicker').value;
        const nombre = document.getElementById('invActNombre').value;
        const sectorNombre = document.getElementById('invActSector').value;
        const clase = document.getElementById('invActClase').value;
        const provider = document.getElementById('invActProvider').value;
        const providerId = document.getElementById('invActProviderId').value;

        try {
          let sectorId = null;
          let sectorFound = invState.sectores.find(s => s.nombre.toLowerCase() === sectorNombre.toLowerCase());
          if (sectorFound) {
            sectorId = sectorFound.id_sector;
          } else {
            const secRes = await api('/api/inv/sectores', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nombre: sectorNombre })
            });
            sectorId = secRes.id_sector;
          }

          await api('/api/inv/activos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, nombre, id_sector: sectorId, clase, api_provider: provider, api_id: providerId })
          });

          showToast('Activo creado');
          invActivoForm.hidden = true;
          invTransaccionForm.hidden = false;
          invActivoForm.reset();
          const badge = document.getElementById('invActTickerBadge');
          if (badge) badge.style.display = 'none';
          const providerInput = document.getElementById('invActProvider');
          if (providerInput) providerInput.disabled = false;
          await loadInversionesData(); 
        } catch (err) {
          showToast(err.message || 'Error creando activo', true);
        }
      });
    }

    if (invTransaccionForm) {
      invTransaccionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id_activo = document.getElementById('invTxActivo').value;
        const tipo_movimiento = document.getElementById('invTxTipo').value;
        const cantidad = Number(document.getElementById('invTxCantidad').value);
        const precio_operacion = Number(document.getElementById('invTxPrecio').value);
        const moneda = document.getElementById('invTxMoneda').value;
        const fecha_operacion = document.getElementById('invTxFecha').value;
        const resta_liquidez_val = document.getElementById('invTxRestaLiquidez')?.value === 'si';
        const tnaInput = document.getElementById('invTxTna');
        const tna = (tnaInput && !tnaInput.hidden && tnaInput.value) ? Number(tnaInput.value) : null;

        if (!id_activo) return showToast('Debe seleccionar un activo', true);

        try {
          await api('/api/inv/transacciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_activo, tipo_movimiento, cantidad, precio_operacion, moneda, fecha_operacion, resta_liquidez: resta_liquidez_val, tna })
          });
          showToast('Transacción registrada');
          invTransaccionForm.reset();
          
          document.querySelector('[data-target="invPositionsTab"]').click();
          await loadInversionesData();
        } catch (err) {
          showToast(err.message || 'Error registrando transacción', true);
        }
      });
    }

    // --- FIN INVERSIONES LOGIC ---

    async function notifyPendingDoingTasks() {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const doingTasks = state.tasks.filter((task) => task.quadrant === 'hacer');
      if (doingTasks.length === 0) return;

      new Notification('Matriz de Eisenhower', {
        body: `Tienes ${doingTasks.length} tarea(s) pendientes en "Hacer".`
      });
    }

    async function initNotifications() {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (_error) {
        }
      }

      setInterval(async () => {
        await loadTasks();
        await notifyPendingDoingTasks();
      }, 7200000);
    }

    // Presupuesto nav button
    const presupuestoBtnListen = document.getElementById('presupuestoViewBtn');
    if (presupuestoBtnListen) {
      presupuestoBtnListen.addEventListener('click', () => setView('presupuesto'));
    }

    (async function init() {
      try {
        loadCategoryColors();
        setupWeekdays();
        const hasSession = await checkSession();
        if (hasSession) {
          setView('matrix');
          await loadTeams();
          await loadTasks();
          // Initialize Budget Dashboard
          if (window.BudgetDashboard) {
            window._budgetDashboard = new window.BudgetDashboard(state.token);
            await window._budgetDashboard.init();
          }
        } else {
          setView('auth');
        }
        await initNotifications();
      } catch (error) {
        console.error(error);
        showToast('No se pudo inicializar la app', true);
      }
    })();



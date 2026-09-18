<script setup>
import { computed, onMounted, ref } from 'vue';
import { DESTINATIONS, ITEMS, RULES } from '../../shared/game';
const inGame = typeof window.mp !== 'undefined';
const visible = ref(true), tab = ref('courier'), state = ref(null), busy = ref(false), last = ref(null);
const username = ref(''), password = ref(''), registering = ref(false), amount = ref(100), target = ref(''), quantity = ref(1);
const message = ref(''), error = ref(false), selected = ref('sandwich');
let timer;
const tabs = [{ id:'courier', num:'01', title:'Работа курьера', sub:'Город ждёт доставку' }, { id:'bank',num:'02',title:'Банк',sub:'Ваши деньги под контролем' }, { id:'inventory',num:'03',title:'Инвентарь',sub:'Всё необходимое с собой' }, { id:'shop',num:'04',title:'Магазин',sub:'Подготовьтесь к смене' }];
const char = computed(() => state.value?.character);
const money = n => Number(n).toLocaleString('ru-RU');
const order = computed(() => state.value?.order);
const jobText = computed(() => !char.value?.on_shift ? 'Начните свою историю' : order.value?.status === 'picked' ? 'Посылка в пути' : order.value ? 'Заказ ждёт на складе' : 'Отличная работа');
const owned = computed(() => state.value?.inventory.find(r => r.item === selected.value)?.quantity || 0);
const jobSteps = computed(() => order.value?.status === 'picked' ? 2 : order.value ? 1 : char.value?.on_shift ? 3 : 0);
function uuid() { const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = Array.from(b, x => x.toString(16).padStart(2,'0')).join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
function send(request) {
  if (busy.value) return;
  if (!inGame) { message.value = 'Это просмотр интерфейса. Игровые действия доступны после подключения к RAGE MP.'; error.value = false; return; }
  busy.value = true; message.value = ''; window.mp.trigger('city:uiRequest', JSON.stringify(request));
  clearTimeout(timer); timer = setTimeout(() => { busy.value = false; message.value = 'Ответ не получен. Можно повторить последнее действие с тем же ID.'; error.value = true; }, 12000);
}
function action(type, fields = {}) { const a = { id: uuid(), type, ...fields }; last.value = a; send({ kind:'action', action:a }); }
function retry() { if (last.value) send({ kind:'action', action:last.value }); }
function login() { last.value = null; send({ id:uuid(), kind:registering.value ? 'register' : 'login', username:username.value, password:password.value }); }
function refresh() { send({ id:uuid(), kind:'state' }); }
function close() { if (inGame) window.mp.trigger('city:uiClose'); }
window.cityVisible = value => { visible.value = value; };
window.cityReceive = raw => {
  const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (p.kind === 'state') state.value = p.state;
  if (p.kind === 'authRequired') { state.value = null; last.value = null; }
  if (['ok','error','notice'].includes(p.kind)) { message.value = p.message; error.value = p.kind === 'error'; }
  if (['ok','error','authRequired'].includes(p.kind)) { busy.value = false; clearTimeout(timer); }
  if (p.kind === 'ok') { password.value = ''; if (registering.value) registering.value = false; last.value = null; }
};
onMounted(() => {
  if (inGame) window.mp.trigger('city:uiReady');
  else state.value = { character:{id:42,name:'alex_morgan',cash:1850,bank:4250,xp:175,hunger:75,on_shift:1,active_order:'preview'},inventory:[{item:'sandwich',quantity:3,slot:0},{item:'water',quantity:5,slot:1},{item:'medkit',quantity:1,slot:2}],weight:4900,level:2,order:{id:'preview',status:'picked',destination:0,reward:550},history:[{id:1,kind:'courier.salary',cash_delta:0,bank_delta:550,created_at:Date.now()}] };
});
</script>
<template>
  <main v-show="visible" class="backdrop" :class="{preview:!inGame}">
    <div class="shell" v-if="state">
      <aside>
        <div class="brand"><span class="brand-mark">C<span>↗</span></span><div>CITYCORE<small>ROLEPLAY / PERSONAL SPACE</small></div></div>
        <div class="profile"><span class="avatar">{{char.name.slice(0,1).toUpperCase()}}</span><div><strong>{{char.name}}</strong><small>Гражданин #{{char.id}}</small></div><span class="online"></span></div>
        <div class="nav-caption">ВАШ ГОРОД. ВАШИ ВОЗМОЖНОСТИ.</div>
        <nav><button v-for="t in tabs" :key="t.id" :class="{active:tab===t.id}" @click="tab=t.id"><span class="nav-num">{{t.num}}</span><span><strong>{{t.title}}</strong><small>{{t.sub}}</small></span><span class="nav-arrow">↗</span></button></nav>
        <div class="aside-bottom"><span class="dot"></span>{{inGame?'Соединение с городом':'Предпросмотр интерфейса'}}<p>F2 — открыть / закрыть</p></div>
      </aside>
      <section class="workspace">
        <header><div><span class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>{{tabs.find(t=>t.id===tab).title}}</h1></div><div class="header-actions"><button class="subtle" :disabled="busy" @click="refresh">↻ Обновить</button><button class="close" @click="close" aria-label="Закрыть">×</button></div></header>
        <div class="wallet"><div><span>Наличные</span><strong>${{money(char.cash)}}</strong></div><div><span>На банковском счёте</span><strong>${{money(char.bank)}}</strong></div><div><span>Уровень курьера</span><strong>{{state.level}} <small>/ {{char.xp}} XP</small></strong></div></div>
        <div class="content-scroll">
          <template v-if="tab==='courier'">
            <div class="hero"><span class="eyebrow">CITYCORE DELIVERY</span><h2>{{jobText}}</h2><p>Доставляйте заказы, исследуйте город<br>и получайте оплату за каждый маршрут.</p><div class="hero-footer"><span class="pill">{{char.on_shift?'НА СМЕНЕ':'СВОБОДНЫЙ ГРАФИК'}}</span><span>от $500 за заказ</span></div><div class="parcel"><span>CC</span><i></i><small>HANDLE WITH CARE ↗</small></div></div>
            <div class="two-col"><div class="panel"><div class="panel-heading"><h3>Текущий маршрут</h3><span class="muted">{{order?'01 / 01':'—'}}</span></div><ol class="steps"><li v-for="(label,i) in ['Начать смену','Забрать посылку','Доставить заказ']" :class="{done:jobSteps>i,current:jobSteps===i}"><span>{{jobSteps>i?'✓':i+1}}</span><div><strong>{{label}}</strong><small>{{i===0?'Склад CityCore':i===1?'Получение в служебном фургоне':order?DESTINATIONS[order.destination].name:'Адрес появится после принятия'}}</small></div></li></ol></div><div class="panel order-panel"><span class="eyebrow">{{order?'ОПЛАТА ЗАКАЗА':'ГОТОВЫ К РАБОТЕ?'}}</span><div class="reward">${{money(order?.reward || (500+Math.min(500,Math.floor(char.xp/100)*50)))}}</div><p>На банковский счёт после доставки.<br>+25 XP за выполненный заказ.</p><button v-if="!char.on_shift" class="primary" :disabled="busy" @click="action('courier.start')">Начать смену ↗</button><button v-else-if="!order" class="primary" :disabled="busy" @click="action('courier.next')">Взять следующий заказ ↗</button><button v-else-if="order.status==='accepted'" class="primary" :disabled="busy" @click="action('courier.pickup')">Получить посылку ↗</button><button v-else class="primary" :disabled="busy" @click="action('courier.deliver')">Передать получателю ↗</button><button v-if="char.on_shift" class="text-button" :disabled="busy" @click="action('courier.cancel')">Завершить смену</button></div></div>
            <div class="hint">↗ Следуйте маршруту на карте. Получение и доставка доступны в вашем служебном фургоне.</div>
          </template>
          <template v-if="tab==='bank'">
            <div class="bank-card"><span>CITYCORE / PERSONAL BANKING</span><strong>${{money(char.bank)}}</strong><div><span>{{char.name.toUpperCase()}}</span><span>ACCOUNT #{{char.id}}</span></div></div>
            <div class="panel"><div class="panel-heading"><h3>Операции со счётом</h3><span class="pill">У ОТДЕЛЕНИЯ БАНКА</span></div><div class="form-row"><label>Сумма, $<input v-model.number="amount" type="number" min="1" max="1000000" step="1"></label><label>ID получателя<input v-model.number="target" type="number" min="1" placeholder="Для перевода"></label></div><div class="button-row"><button class="primary" :disabled="busy" @click="action('bank.deposit',{amount})">Пополнить</button><button class="secondary" :disabled="busy" @click="action('bank.withdraw',{amount})">Снять</button><button class="secondary" :disabled="busy || !target" @click="action('bank.transfer',{amount,targetId:Number(target)})">Перевести ↗</button></div></div>
            <div class="panel"><h3>Последние операции</h3><div v-if="!state.history.length" class="muted">Операций пока нет</div><div v-for="row in state.history" :key="row.id" class="history"><span>{{({'courier.salary':'Оплата доставки','account.welcome':'Стартовый баланс','bank.deposit':'Пополнение','bank.withdraw':'Снятие','bank.transfer':'Перевод','bank.incoming':'Входящий перевод','shop.buy':'Покупка','shop.sell':'Продажа'})[row.kind]||row.kind}}<small>{{new Date(Number(row.created_at)).toLocaleString('ru-RU')}}</small></span><strong>{{row.bank_delta>=0?'+':''}}{{money(row.bank_delta)}} $<small>наличные {{row.cash_delta>=0?'+':''}}{{money(row.cash_delta)}} $</small></strong></div></div>
          </template>
          <template v-if="tab==='inventory' || tab==='shop'">
            <div class="panel-heading"><h3>{{tab==='shop'?'Товары для вашей смены':'Ваши предметы'}}</h3><span class="muted">{{(state.weight/1000).toFixed(1)}} / {{RULES.maxWeight/1000}} кг · {{state.inventory.length}} / {{RULES.slots}} слотов</span></div>
            <div class="weight-track"><i :style="{width:Math.min(100,state.weight/RULES.maxWeight*100)+'%'}"></i></div>
            <div class="items"><button v-for="(item,id) in ITEMS" :key="id" class="item" :class="{selected:selected===id,empty:tab==='inventory'&&!state.inventory.some(r=>r.item===id)}" @click="selected=id"><span class="item-icon">{{({water:'◒',sandwich:'▱',medkit:'✚',toolkit:'⚒'})[id]}}</span><strong>{{item.name}}</strong><small>{{tab==='shop'?'$'+item.buy:((state.inventory.find(r=>r.item===id)?.quantity||0)+' шт.')}}</small></button></div>
            <div class="panel"><div class="panel-heading"><h3>{{ITEMS[selected].name}}</h3><span class="muted">{{ITEMS[selected].weight/1000}} кг / шт. · В наличии: {{owned}}</span></div><div class="form-row"><label>Количество<input v-model.number="quantity" type="number" min="1" max="100" step="1"></label><label v-if="tab==='inventory'">ID игрока рядом<input v-model.number="target" type="number" min="1" placeholder="Для передачи"></label><div v-else class="price">Продажа: ${{ITEMS[selected].sell}} / шт.</div></div><div class="button-row" v-if="tab==='shop'"><button class="primary" :disabled="busy" @click="action('shop.buy',{item:selected,quantity})">Купить · ${{money(ITEMS[selected].buy*quantity)}}</button><button class="secondary" :disabled="busy || owned<quantity" @click="action('shop.sell',{item:selected,quantity})">Продать</button></div><div class="button-row" v-else><button class="primary" :disabled="busy || !owned || ITEMS[selected].effect==='none'" @click="action('inventory.use',{item:selected})">Использовать 1 шт.</button><button class="secondary" :disabled="busy || owned<quantity || !target" @click="action('inventory.give',{item:selected,quantity,targetId:Number(target)})">Передать ↗</button></div></div><div class="hint">{{tab==='shop'?'↗ Покупка и продажа доступны у магазина, отмеченного на карте.':'Сытость: '+char.hunger+'% · Для передачи подойдите к игроку на расстояние до 3 метров.'}}</div>
          </template>
        </div>
        <footer><span class="status" :class="{error}">{{busy?'Выполняем запрос…':message||'Добро пожаловать. Город начинается с вас.'}}</span><button v-if="last && !busy && error" class="text-button" @click="retry">Повторить действие</button><span v-else class="version">CITYCORE / 1.0</span></footer>
      </section>
    </div>
    <div v-else class="auth-card"><div class="brand"><span class="brand-mark">C↗</span><div>CITYCORE<small>ВАША ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</small></div></div><span class="eyebrow">WELCOME TO THE CITY</span><h1>{{registering?'Новая история':'С возвращением'}}</h1><p>Работайте, знакомьтесь и найдите<br>своё место в большом городе.</p><form @submit.prevent="login"><label>Имя аккаунта<input v-model="username" required minlength="3" maxlength="24" pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}" placeholder="alex_morgan" autocomplete="username"></label><label>Пароль<input v-model="password" type="password" required minlength="10" maxlength="100" :autocomplete="registering?'new-password':'current-password'" placeholder="Не менее 10 символов"></label><button class="primary" :disabled="busy">{{busy?'Подождите…':registering?'Создать аккаунт ↗':'Войти в город ↗'}}</button></form><button class="text-button" :disabled="busy" @click="registering=!registering">{{registering?'Уже есть аккаунт? Войти':'Первый раз здесь? Создать аккаунт'}}</button><p class="status" :class="{error}">{{message}}</p></div>
  </main>
</template>

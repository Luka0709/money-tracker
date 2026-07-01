const homeView = document.querySelector("#homeView");
const personView = document.querySelector("#personView");
const peopleList = document.querySelector("#peopleList");
const emptyState = document.querySelector("#emptyState");
const totalBalance = document.querySelector("#totalBalance");
const addPersonButton = document.querySelector("#addPersonButton");
const refreshButton = document.querySelector("#refreshButton");
const personDialog = document.querySelector("#personDialog");
const personForm = document.querySelector("#personForm");
const closeDialogButton = document.querySelector("#closeDialogButton");
const nameInput = document.querySelector("#nameInput");
const saveButton = document.querySelector("#saveButton");
const personTitle = document.querySelector("#personTitle");
const personBalance = document.querySelector("#personBalance");
const adjustmentForm = document.querySelector("#adjustmentForm");
const personAdjustmentInput = document.querySelector("#personAdjustmentInput");
const saveAdjustmentButton = document.querySelector("#saveAdjustmentButton");
const toast = document.querySelector("#toast");

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

let people = [];
let activePerson = null;

function personIdFromUrl() {
  return new URLSearchParams(window.location.search).get("person");
}

function formatMoney(value) {
  return currency.format(Number(value) || 0);
}

function balanceClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function showHome() {
  homeView.hidden = false;
  personView.hidden = true;
  document.body.classList.remove("detail-mode");
}

function showPerson() {
  homeView.hidden = true;
  personView.hidden = false;
  document.body.classList.add("detail-mode");
}

function renderHome() {
  peopleList.replaceChildren();
  emptyState.hidden = people.length > 0;

  const net = people.reduce((sum, person) => sum + Number(person.balance || 0), 0);
  totalBalance.textContent = formatMoney(net);
  totalBalance.className = balanceClass(net);

  for (const person of people) {
    const row = document.createElement("a");
    row.className = "person-row";
    row.href = `/?person=${encodeURIComponent(person.id)}`;
    row.target = "_blank";
    row.rel = "noopener";

    const text = document.createElement("span");
    const name = document.createElement("span");
    name.className = "person-name";
    name.textContent = person.name;

    const updated = document.createElement("span");
    updated.className = "person-updated";
    updated.textContent = person.updated_at
      ? `Updated ${new Date(person.updated_at).toLocaleString()}`
      : "No updates yet";

    const balance = document.createElement("span");
    balance.className = `balance ${balanceClass(person.balance)}`;
    balance.textContent = formatMoney(person.balance);

    text.append(name, updated);
    row.append(text, balance);
    peopleList.append(row);
  }
}

function renderPerson(person) {
  activePerson = person;
  personTitle.textContent = person.name;
  personBalance.textContent = formatMoney(person.balance);
  personBalance.className = balanceClass(person.balance);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || "Something went wrong.");
  }

  return response.json();
}

async function loadPeople() {
  refreshButton.disabled = true;
  try {
    people = await request("/api/people");
    renderHome();
  } catch (error) {
    showToast(error.message);
  } finally {
    refreshButton.disabled = false;
  }
}

async function loadPerson(id) {
  showPerson();
  try {
    const person = await request(`/api/people/${encodeURIComponent(id)}`);
    renderPerson(person);
  } catch (error) {
    showToast(error.message);
  }
}

function openNewPerson() {
  nameInput.value = "";
  saveButton.disabled = false;
  personDialog.showModal();
  nameInput.focus();
}

function parseAdjustment(value) {
  const clean = value.trim().replace(",", ".");
  if (!/^[+-]\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error("Enter an amount like +25 or -10.");
  }
  return Number(clean);
}

personForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    saveButton.disabled = true;
    const created = await request("/api/people", {
      method: "POST",
      body: JSON.stringify({ name: nameInput.value.trim() }),
    });

    people = [...people, created];
    renderHome();
    personDialog.close();
    showToast("Person added.");
  } catch (error) {
    showToast(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

adjustmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activePerson) return;

  try {
    const adjustment = parseAdjustment(personAdjustmentInput.value);
    saveAdjustmentButton.disabled = true;
    const updated = await request(`/api/people/${encodeURIComponent(activePerson.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ adjustment }),
    });

    renderPerson(updated);
    personAdjustmentInput.value = "";
    showToast("Balance updated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    saveAdjustmentButton.disabled = false;
  }
});

addPersonButton.addEventListener("click", openNewPerson);
refreshButton.addEventListener("click", loadPeople);
closeDialogButton.addEventListener("click", () => personDialog.close());

const initialPersonId = personIdFromUrl();
if (initialPersonId) {
  loadPerson(initialPersonId);
} else {
  showHome();
  loadPeople();
}

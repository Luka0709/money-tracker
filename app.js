const peopleList = document.querySelector("#peopleList");
const emptyState = document.querySelector("#emptyState");
const totalBalance = document.querySelector("#totalBalance");
const addPersonButton = document.querySelector("#addPersonButton");
const refreshButton = document.querySelector("#refreshButton");
const personDialog = document.querySelector("#personDialog");
const personForm = document.querySelector("#personForm");
const closeDialogButton = document.querySelector("#closeDialogButton");
const dialogMode = document.querySelector("#dialogMode");
const dialogTitle = document.querySelector("#dialogTitle");
const nameInput = document.querySelector("#nameInput");
const adjustmentInput = document.querySelector("#adjustmentInput");
const currentBalance = document.querySelector("#currentBalance");
const saveButton = document.querySelector("#saveButton");
const toast = document.querySelector("#toast");

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

let people = [];
let selectedPerson = null;

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

function render() {
  peopleList.replaceChildren();
  emptyState.hidden = people.length > 0;

  const net = people.reduce((sum, person) => sum + Number(person.balance || 0), 0);
  totalBalance.textContent = formatMoney(net);
  totalBalance.className = balanceClass(net);

  for (const person of people) {
    const row = document.createElement("button");
    row.className = "person-row";
    row.type = "button";
    row.addEventListener("click", () => openPerson(person));

    const text = document.createElement("span");
    const name = document.createElement("span");
    name.className = "person-name";
    name.textContent = person.name;

    const updated = document.createElement("span");
    updated.className = "person-updated";
    updated.textContent = person.updated_at ? `Updated ${new Date(person.updated_at).toLocaleDateString()}` : "No updates yet";

    const balance = document.createElement("span");
    balance.className = `balance ${balanceClass(person.balance)}`;
    balance.textContent = formatMoney(person.balance);

    text.append(name, updated);
    row.append(text, balance);
    peopleList.append(row);
  }
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
    render();
  } catch (error) {
    showToast(error.message);
  } finally {
    refreshButton.disabled = false;
  }
}

function openPerson(person) {
  selectedPerson = person;
  dialogMode.textContent = "Edit balance";
  dialogTitle.textContent = person.name;
  nameInput.value = person.name;
  nameInput.disabled = true;
  adjustmentInput.value = "";
  currentBalance.textContent = formatMoney(person.balance);
  currentBalance.className = balanceClass(person.balance);
  saveButton.textContent = "Save adjustment";
  personDialog.showModal();
  adjustmentInput.focus();
}

function openNewPerson() {
  selectedPerson = null;
  dialogMode.textContent = "New person";
  dialogTitle.textContent = "Add person";
  nameInput.value = "";
  nameInput.disabled = false;
  adjustmentInput.value = "";
  currentBalance.textContent = formatMoney(0);
  currentBalance.className = "neutral";
  saveButton.textContent = "Add person";
  personDialog.showModal();
  nameInput.focus();
}

function parseAdjustment(value) {
  const clean = value.trim().replace(",", ".");
  if (!clean) return 0;
  if (!/^[+-]\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error("Enter an amount like +25 or -10.");
  }
  return Number(clean);
}

personForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const adjustment = parseAdjustment(adjustmentInput.value);
    saveButton.disabled = true;

    if (selectedPerson) {
      const updated = await request(`/api/people/${encodeURIComponent(selectedPerson.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ adjustment }),
      });
      people = people.map((person) => (person.id === updated.id ? updated : person));
      showToast("Balance updated.");
    } else {
      const created = await request("/api/people", {
        method: "POST",
        body: JSON.stringify({ name: nameInput.value.trim() }),
      });
      people = [...people, created];
      showToast("Person added.");
    }

    render();
    personDialog.close();
  } catch (error) {
    showToast(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

addPersonButton.addEventListener("click", openNewPerson);
refreshButton.addEventListener("click", loadPeople);
closeDialogButton.addEventListener("click", () => personDialog.close());

loadPeople();

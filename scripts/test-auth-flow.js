const baseUrl = process.env.TEST_BASE_URL?.trim();
const adminEmail = process.env.TEST_ADMIN_EMAIL?.trim();
const adminPassword = process.env.TEST_ADMIN_PASSWORD?.trim();

if (!baseUrl || !adminEmail || !adminPassword) {
  console.error(
    "Configura TEST_BASE_URL, TEST_ADMIN_EMAIL e TEST_ADMIN_PASSWORD prima di eseguire lo script.",
  );
  process.exit(1);
}

function parseSetCookie(headers) {
  const raw = headers.get("set-cookie");
  if (!raw) {
    return "";
  }

  return raw
    .split(/,(?=[^;]+?=)/g)
    .map((entry) => entry.split(";")[0].trim())
    .join("; ");
}

async function request(path, options = {}, cookie = "") {
  const headers = new Headers(options.headers || {});
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  const nextCookie = [cookie, parseSetCookie(response.headers)]
    .filter(Boolean)
    .join("; ");
  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body, cookie: nextCookie };
}

async function main() {
  const suffix = Date.now();
  const tempProfessionalEmail = `test-prof-${suffix}@example.test`;
  const tempRefertatoreEmail = `test-ref-${suffix}@example.test`;
  const tempRefertatorePassword = `Rmdc-Test!${suffix}`;

  let cookie = "";

  console.log("1. Login admin");
  let result = await request(
    "/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    },
    cookie,
  );
  cookie = result.cookie;
  if (!result.response.ok) {
    throw new Error(`Login admin fallito: ${result.response.status}`);
  }

  console.log("2. GET /auth/me");
  result = await request("/auth/me", { method: "GET" }, cookie);
  if (!result.response.ok) {
    throw new Error(`GET /auth/me fallito: ${result.response.status}`);
  }

  console.log("3. GET /auth/csrf");
  result = await request("/auth/csrf", { method: "GET" }, cookie);
  if (!result.response.ok || !result.body?.csrfToken) {
    throw new Error("Recupero CSRF fallito.");
  }
  const csrfToken = result.body.csrfToken;
  cookie = result.cookie;

  console.log("4. POST /admin/professionals senza CSRF (atteso 403/4xx)");
  const noCsrf = await request(
    "/admin/professionals",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        first_name: "Test",
        last_name: "NoCsrf",
        display_name: "Test NoCsrf",
        email: tempProfessionalEmail,
        specializzazione: "Neurologia",
        professional_type: "medico",
        active: true,
      }),
    },
    cookie,
  );
  if (noCsrf.response.ok) {
    throw new Error("La protezione CSRF non ha bloccato la richiesta mutativa.");
  }

  console.log("5. Creo professionista di test");
  result = await request(
    "/admin/professionals",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        first_name: "Test",
        last_name: "Neurologo",
        display_name: "Dott. Test Neurologo",
        email: tempProfessionalEmail,
        specializzazione: "Neurologia",
        professional_type: "medico",
        visible_in_standard: true,
        active: true,
      }),
    },
    cookie,
  );
  if (!result.response.ok || !result.body?.id) {
    throw new Error("Creazione professionista di test fallita.");
  }
  const professionalId = result.body.id;

  console.log("6. Creo refertatore collegato al professionista");
  result = await request(
    "/admin/users",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        role: "refertatore",
        professional_id: professionalId,
        email: tempRefertatoreEmail,
        password: tempRefertatorePassword,
        assignedTypes: ["emg", "psg"],
      }),
    },
    cookie,
  );
  if (!result.response.ok || !result.body?.id) {
    throw new Error("Creazione refertatore di test fallita.");
  }
  const refertatoreId = result.body.id;

  console.log("7. Login refertatore");
  let refCookie = "";
  result = await request(
    "/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: tempRefertatoreEmail,
        password: tempRefertatorePassword,
      }),
    },
    refCookie,
  );
  refCookie = result.cookie;
  if (!result.response.ok) {
    throw new Error("Login refertatore di test fallito.");
  }

  console.log("8. GET /auth/me refertatore");
  result = await request("/auth/me", { method: "GET" }, refCookie);
  if (!result.response.ok || result.body?.user?.role !== "refertatore") {
    throw new Error("Verifica refertatore fallita.");
  }

  console.log("9. DELETE /admin/users/:id");
  result = await request(
    `/admin/users/${refertatoreId}`,
    {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken },
    },
    cookie,
  );
  if (!result.response.ok) {
    throw new Error("Disattivazione refertatore di test fallita.");
  }

  console.log("10. DELETE /admin/professionals/:id");
  result = await request(
    `/admin/professionals/${professionalId}`,
    {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken },
    },
    cookie,
  );
  if (!result.response.ok) {
    throw new Error("Disattivazione professionista di test fallita.");
  }

  console.log("Test auth/CSRF completato con successo.");
}

main().catch((error) => {
  console.error("Test auth flow fallito:", error?.message || error);
  process.exit(1);
});

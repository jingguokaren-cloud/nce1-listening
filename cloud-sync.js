const cloudbase = globalThis.cloudbase;
if (!cloudbase) throw new Error("CloudBase SDK 未加载");

const CLOUDBASE_ENV_ID = "sonseducation-d5glzge0b6d2738d4";
const CLOUDBASE_REGION = "ap-shanghai";
const CLOUDBASE_PUBLISHABLE_KEY = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL3NvbnNlZHVjYXRpb24tZDVnbHpnZTBiNmQyNzM4ZDQuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6InNvbnNlZHVjYXRpb24tZDVnbHpnZTBiNmQyNzM4ZDQiLCJleHAiOjQwODk0NDAxNDcsImlhdCI6MTc4NTc1Njk0Nywibm9uY2UiOiI5R3oyeGFESFJUSzBmSkxkUXExNF9nIiwiYXRfaGFzaCI6IjlHejJ4YURIUlRLMGZKTGRRcTE0X2ciLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoic29uc2VkdWNhdGlvbi1kNWdsemdlMGI2ZDI3MzhkNCIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.A9VuDHB_a4AI7acLU9Ksuscox8J53XVk97HkrALtiZMwbwNWDI22r3Fa-vFlbqNhbzc7cDfyKR-qorjztslgEmvYgvLIYCirqK5zdPMTB3gEb_fgbmJN8AxXyUeIfK7yuMpcX5jT0KLn3EY95m-bUpPnBOkt-HFXR223SsG4G3cmkFpn9iYHrKRWOjKm9HbnMOdl_2A-0GbrbWTZxQOfsLILQdFr0XWEhHx6o0odvSnrmfT5zgOtiVNNbTp8bPXGLlGyHLsnW7Vnit0FQLZ86RUin6O2FQJS7J6HMjfknzUog41fMYRFtcQvtMxR9S5vKejm0ERqicFuI7qxld1tVg";
const COLLECTION_NAME = "nce1_student_progress";
const APP_ID = "nce1-listening";
const USERNAME_KEY = "nce1-listening-last-username";
const SYNC_DELAY_MS = 900;
const RETRY_DELAY_MS = 12000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeMap(localMap = {}, cloudMap = {}, preferLocal) {
  const merged = {};
  const keys = new Set([...Object.keys(localMap), ...Object.keys(cloudMap)]);
  keys.forEach((key) => {
    const localValue = localMap[key];
    const cloudValue = cloudMap[key];
    if (localValue === undefined || localValue === "") merged[key] = cloudValue;
    else if (cloudValue === undefined || cloudValue === "") merged[key] = localValue;
    else merged[key] = preferLocal ? localValue : cloudValue;
  });
  return merged;
}

function mergeFlags(localMap = {}, cloudMap = {}) {
  const merged = {};
  const keys = new Set([...Object.keys(localMap), ...Object.keys(cloudMap)]);
  keys.forEach((key) => {
    if (localMap[key] || cloudMap[key]) merged[key] = true;
  });
  return merged;
}

function mergeStates(localState = {}, cloudState = {}, cloudUpdatedAt = 0) {
  const localUpdatedAt = Number(localState.updatedAt) || 0;
  const remoteUpdatedAt = Number(cloudState.updatedAt || cloudUpdatedAt) || 0;
  const preferLocal = localUpdatedAt >= remoteUpdatedAt;
  return {
    lesson: preferLocal ? (localState.lesson || cloudState.lesson || "l001-002") : (cloudState.lesson || localState.lesson || "l001-002"),
    answers: mergeMap(localState.answers, cloudState.answers, preferLocal),
    checked: mergeFlags(localState.checked, cloudState.checked),
    wrong: mergeMap(localState.wrong, cloudState.wrong, preferLocal),
    stars: mergeFlags(localState.stars, cloudState.stars),
    rate: preferLocal ? (localState.rate || cloudState.rate || 1) : (cloudState.rate || localState.rate || 1),
    updatedAt: Math.max(Date.now(), localUpdatedAt, remoteUpdatedAt),
  };
}

function extractUser(response) {
  return response?.data?.user || response?.user || response?.data || null;
}

function extractSession(response) {
  return response?.data?.session || response?.session || response?.data || null;
}

function isNamedUser(user, session) {
  if (!user || !session) return false;
  if (user.is_anonymous || user.isAnonymous) return false;
  const loginType = String(session.loginType || session.login_type || "").toUpperCase();
  return loginType !== "ANONYMOUS";
}

function userIdOf(user) {
  return user?.id || user?.uid || user?._id || "";
}

function usernameOf(user) {
  return user?.username
    || user?.user_metadata?.username
    || user?.metadata?.username
    || localStorage.getItem(USERNAME_KEY)
    || "学生";
}

function displayNameOf(user, username) {
  return user?.name
    || user?.nickname
    || user?.nickName
    || user?.user_metadata?.name
    || user?.user_metadata?.nickname
    || username
    || "学生";
}

export async function createCloudSync({
  getState,
  applyState,
  getSummary,
  onAuthenticated,
  onSignedOut,
}) {
  const app = cloudbase.init({
    env: CLOUDBASE_ENV_ID,
    region: CLOUDBASE_REGION,
    accessKey: CLOUDBASE_PUBLISHABLE_KEY,
  });
  const auth = typeof app.auth === "function" ? app.auth() : app.auth;
  const collection = app.database().collection(COLLECTION_NAME);
  const elements = {
    dot: document.getElementById("cloudSyncDot"),
    status: document.getElementById("cloudSyncStatus"),
    syncNow: document.getElementById("cloudSyncNow"),
    logout: document.getElementById("cloudLogout"),
    form: document.getElementById("cloudLoginForm"),
    username: document.getElementById("cloudUsername"),
    password: document.getElementById("cloudPassword"),
    cancel: document.getElementById("cloudLoginCancel"),
    message: document.getElementById("cloudAuthMessage"),
  };
  let currentUser = null;
  let currentUsername = "";
  let currentDisplayName = "";
  let documentId = "";
  let syncTimer = null;
  let retryTimer = null;
  let syncing = false;

  function setStatus(text, tone = "idle") {
    elements.status.textContent = text;
    elements.dot.classList.toggle("online", tone === "online");
    elements.dot.classList.toggle("error", tone === "error");
  }

  function setMessage(text) {
    elements.message.textContent = text;
  }

  function updateAuthUi() {
    const signedIn = Boolean(currentUser);
    document.body.classList.toggle("auth-locked", !signedIn);
    elements.logout.hidden = !signedIn;
    elements.syncNow.hidden = !signedIn;
    elements.form.hidden = signedIn;
    elements.cancel.hidden = true;
    elements.password.value = "";
    setMessage(signedIn ? "" : "账号由老师创建；密码不会保存到网页中。");
    setStatus(
      signedIn ? `${currentDisplayName} · 云端记录已连接` : "登录后进入听力课程",
      signedIn ? "online" : "idle"
    );
  }

  function cloudRecord(state) {
    return {
      appId: APP_ID,
      studentName: currentDisplayName,
      loginName: currentUsername,
      userId: userIdOf(currentUser),
      state: clone(state),
      summary: getSummary(),
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    };
  }

  async function findRecord() {
    const userId = userIdOf(currentUser);
    const query = userId ? { appId: APP_ID, userId } : { appId: APP_ID, loginName: currentUsername };
    const result = await collection.where(query).limit(1).get();
    if (result?.code) throw new Error(result.message || result.code);
    return result?.data?.[0] || null;
  }

  async function writeState(state) {
    const payload = cloudRecord(state);
    const result = documentId
      ? await collection.doc(documentId).update(payload)
      : await collection.add(payload);
    if (result?.code) throw new Error(result.message || result.code);
    if (!documentId) documentId = result?.id || result?._id || "";
  }

  async function loadAndMerge() {
    setStatus(`${currentDisplayName} · 正在合并学习记录…`);
    const record = await findRecord();
    documentId = record?._id || "";
    const merged = mergeStates(getState(), record?.state || {}, record?.updatedAt);
    applyState(merged);
    await writeState(merged);
    setStatus(`${currentDisplayName} · 已同步`, "online");
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => syncNow(), RETRY_DELAY_MS);
  }

  async function syncNow() {
    if (!currentUser || syncing) return;
    clearTimeout(syncTimer);
    clearTimeout(retryTimer);
    syncing = true;
    setStatus(`${currentDisplayName} · 正在同步…`);
    try {
      await writeState(getState());
      setStatus(`${currentDisplayName} · 已同步`, "online");
    } catch (error) {
      setStatus("本机已保存 · 云同步待重试", "error");
      scheduleRetry();
      console.error("听力学习记录同步失败", error);
    } finally {
      syncing = false;
    }
  }

  function queueSync() {
    if (!currentUser) return;
    setStatus(`${currentDisplayName} · 待同步`);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), SYNC_DELAY_MS);
  }

  async function login(username, password) {
    setMessage("正在登录并读取云端记录…");
    setStatus("正在连接 CloudBase…");
    const response = await auth.signInWithPassword({ username, password });
    if (response?.error) throw response.error;
    const user = extractUser(response);
    const session = extractSession(response);
    if (!isNamedUser(user, session)) throw new Error("未获得有效的学生登录状态");
    currentUser = user;
    currentUsername = username;
    currentDisplayName = displayNameOf(user, username);
    localStorage.setItem(USERNAME_KEY, username);
    onAuthenticated?.({ userId: userIdOf(user), username });
    await loadAndMerge();
    updateAuthUi();
  }

  async function restoreSession() {
    try {
      const sessionResponse = await auth.getSession();
      if (sessionResponse?.error) return;
      const session = extractSession(sessionResponse);
      if (!session) return;
      const userResponse = await auth.getUser();
      if (userResponse?.error) return;
      const user = extractUser(userResponse);
      if (!isNamedUser(user, session)) return;
      currentUser = user;
      currentUsername = usernameOf(user);
      currentDisplayName = displayNameOf(user, currentUsername);
      onAuthenticated?.({ userId: userIdOf(user), username: currentUsername });
      await loadAndMerge();
      updateAuthUi();
    } catch (error) {
      setStatus("本机保存 · 云端会话恢复失败", "error");
      console.error("CloudBase 会话恢复失败", error);
    }
  }

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = elements.username.value.trim();
    const password = elements.password.value;
    if (!username || !password) return;
    const submitButton = elements.form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      await login(username, password);
    } catch (error) {
      setMessage(error?.message || "登录失败，请检查账号和密码。");
      setStatus("登录失败 · 请重试", "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.cancel.addEventListener("click", () => {
    elements.form.hidden = true;
    elements.password.value = "";
    setMessage("");
  });

  elements.logout.addEventListener("click", async () => {
    try {
      await syncNow();
      const response = await auth.signOut();
      if (response?.error) throw response.error;
    } catch (error) {
      console.error("退出 CloudBase 失败", error);
    }
    currentUser = null;
    currentUsername = "";
    currentDisplayName = "";
    documentId = "";
    onSignedOut?.();
    updateAuthUi();
  });

  elements.syncNow.addEventListener("click", () => syncNow());
  window.addEventListener("online", () => syncNow());
  window.addEventListener("beforeunload", () => {
    if (currentUser) syncNow();
  });

  updateAuthUi();
  await restoreSession();
  return { queueSync, syncNow };
}

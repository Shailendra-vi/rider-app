let session = null;
let revision = 0;
let onExpired = () => {};
const controllers = new Set();

export function getSession() { return session; }
export function getRevision() { return revision; }
export function setSession(next) {
  session = next;
  revision += 1;
  controllers.forEach(controller => controller.abort());
  controllers.clear();
}
export function trackRequest(controller) {
  controllers.add(controller);
  return () => controllers.delete(controller);
}
export function onSessionExpired(callback) { onExpired = callback; return () => { onExpired = () => {}; }; }
export function expireIfCurrent(expectedRevision) {
  if (expectedRevision === revision) onExpired();
}

/**
 * Blindaje contra el traductor del navegador (Chrome/Edge "Traducir a inglés").
 *
 * El traductor SUSTITUYE cada nodo de texto por `<font>…</font>` con el texto traducido. React
 * conserva la referencia al nodo original, que ya no cuelga de su padre; en el siguiente
 * re-render llama `removeChild`/`insertBefore` sobre él y el navegador lanza
 * `NotFoundError: The node to be removed is not a child of this node`. Como pasa durante el
 * render, el error tumba toda la página ("Application error: a client-side exception has
 * occurred"): reportado en Métricas → Operadores & Empacadores y otras pantallas.
 *
 * El parche hace tolerantes esas dos operaciones: si el nodo ya no pertenece al padre, se
 * devuelve sin tocar el DOM en vez de reventar. La app sigue funcionando traducida (a lo sumo
 * un trozo de texto queda en el idioma anterior hasta el siguiente render). Es el remedio
 * estándar para este choque conocido entre React y el traductor.
 *
 * Se ejecuta como script `beforeInteractive` para estar activo ANTES de la hidratación, que es
 * donde también puede ocurrir el choque.
 */
export const TRANSLATE_DOM_GUARD_SNIPPET = `(function () {
  if (typeof Node !== 'function' || !Node.prototype) return;
  var proto = Node.prototype;
  if (proto.__paskalTranslateGuard) return;
  proto.__paskalTranslateGuard = true;

  var removeChild = proto.removeChild;
  proto.removeChild = function (child) {
    if (child && child.parentNode !== this) return child;
    return removeChild.apply(this, arguments);
  };

  var insertBefore = proto.insertBefore;
  proto.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return removeChild === undefined ? newNode : this.appendChild(newNode);
    }
    return insertBefore.apply(this, arguments);
  };
})();`

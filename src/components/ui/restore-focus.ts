import * as React from "react";

/**
 * Returns focus to whatever opened a dialog or sheet when it closes.
 *
 * Radix only restores focus to a `<Trigger>` part. Most overlays here are opened from ordinary buttons or menu
 * items with controlled state, so without this, closing one drops keyboard and screen-reader users back at the
 * top of the page (WCAG 2.4.3). If the opener was a menu item (which disappears when the menu closes), focus
 * goes back to that menu's button instead.
 */
export function useRestoreFocus() {
  const target = React.useRef<HTMLElement | null>(null);

  const onOpenAutoFocus = React.useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    let el: HTMLElement | null = active && active !== document.body ? active : null;
    const menu = active?.closest?.('[role="menu"]');
    if (menu?.id) el = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) ?? el;
    target.current = el;
  }, []);

  const onCloseAutoFocus = React.useCallback((event: Event) => {
    const el = target.current;
    target.current = null;
    if (el?.isConnected) {
      event.preventDefault(); // we take over; Radix would otherwise focus a Trigger that doesn't exist
      el.focus({ preventScroll: true });
    }
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}

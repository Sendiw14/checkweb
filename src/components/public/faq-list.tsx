"use client";
import * as React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Faq } from "@/content/faq";

/** Opens the question named in the URL hash (e.g. /faq#what-is-checked) and keeps in sync with it. */
export function FaqList({ items }: { items: Faq[] }) {
  const [value, setValue] = React.useState<string>("");
  React.useEffect(() => {
    const sync = () => { const id = window.location.hash.slice(1); if (items.some((f) => f.id === id)) { setValue(id); document.getElementById(id)?.scrollIntoView({ block: "center" }); } };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [items]);
  return (
    <Accordion type="single" collapsible value={value} onValueChange={setValue}>
      {items.map((f) => (
        <AccordionItem key={f.id} value={f.id} id={f.id} className="scroll-mt-28">
          <AccordionTrigger>{f.q}</AccordionTrigger>
          <AccordionContent>{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

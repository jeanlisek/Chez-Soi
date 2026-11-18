import { FileText, Lightbulb, Scale } from "lucide-react";

import { libelleSource, type Source } from "@/lib/domaine";
import { cn } from "@/lib/utils";

/**
 * Source d'une action, dans l'ordre du verdict : contrat (clause et page), loi (Légifrance),
 * puis recommandé. Une référence du neuf reste « recommandé », jamais « obligation légale ».
 */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const Icone = source.force === "contrat" ? FileText : source.force === "loi" ? Scale : Lightbulb;
  const contenu = (
    <>
      <Icone className="size-3.5 shrink-0" />
      {libelleSource(source)}
    </>
  );
  const classes = cn("inline-flex items-center gap-1 text-sm text-encre-douce", className);
  if (source.force === "loi")
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer" className={cn(classes, "underline")}>
        {contenu}
      </a>
    );
  return (
    <span className={classes} title={source.force === "contrat" ? source.clause : undefined}>
      {contenu}
    </span>
  );
}

"use client";

import type { ToolUIPart } from "ai";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CreateExercisesOutput } from "@/lib/chat/tool-outputs";

/** The learner's answer to a tool call that waits for approval. */
export type ApprovalHandler = (approvalId: string, approved: boolean) => void;

const note = "text-xs text-muted-foreground";

/**
 * A create_exercises call in the chat: the approval card with what will be created, the progress
 * while it runs, and the links to the new set and to the construct's theory.
 */
export function CreateExercisesPart({
  part,
  onApproval,
  disabled,
}: {
  part: ToolUIPart;
  onApproval: ApprovalHandler;
  disabled?: boolean;
}) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <p className={note}>Preparing exercises…</p>;
    case "approval-requested":
      if (part.approval.isAutomatic) return <p className={note}>Preparing exercises…</p>;
      return (
        <div className="flex max-w-[90%] flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
          <p>{part.approval.requestReason ?? "Create these exercises?"}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={disabled} onClick={() => onApproval(part.approval.id, true)}>
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onApproval(part.approval.id, false)}
            >
              Don’t create
            </Button>
          </div>
        </div>
      );
    case "approval-responded":
      return (
        <p className={note}>
          {part.approval.approved ? "Creating exercises… this can take a minute." : "Not created."}
        </p>
      );
    case "output-denied":
      return (
        <p className={note}>
          Not created{part.approval.isAutomatic && part.approval.reason ? `: ${part.approval.reason}` : "."}
        </p>
      );
    case "output-error":
      return <p className="text-xs text-destructive">Could not create the exercises: {part.errorText}</p>;
    case "output-available": {
      const output = part.output as CreateExercisesOutput;
      return (
        <div className="flex max-w-[90%] flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
          <p>
            {output.count} exercises on {output.constructs.map((c) => `“${c.name}”`).join(", ")} ({output.level})
          </p>
          {output.constructs.some((c) => c.addedToGrammar) && (
            <p className={note}>Added to your grammar list.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Link href={output.setHref} className={buttonVariants({ size: "sm" })}>
              Start exercises
            </Link>
            {output.constructs.map((c) => (
              <Link
                key={c.theoryHref}
                href={c.theoryHref}
                className="text-sm underline underline-offset-4 hover:text-foreground"
              >
                Theory{output.constructs.length > 1 ? `: ${c.name}` : ""}
              </Link>
            ))}
          </div>
        </div>
      );
    }
  }
}

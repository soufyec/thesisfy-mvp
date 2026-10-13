"use client";

import { useParams } from "next/navigation";
import DocsEditor from "@/components/editor/DocsEditor";
import EditorErrorBoundary from "@/components/editor/EditorErrorBoundary";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  return (
    <EditorErrorBoundary context={`editor:${params.id}`}>
      <DocsEditor thesisId={params.id} />
    </EditorErrorBoundary>
  );
}

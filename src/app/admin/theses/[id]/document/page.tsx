"use client";

import { useParams } from "next/navigation";
import DocsEditor from "@/components/editor/DocsEditor";
import EditorErrorBoundary from "@/components/editor/EditorErrorBoundary";

export default function AdminThesisDocument() {
  const params = useParams<{ id: string }>();
  return (
    <EditorErrorBoundary context={`admin-document:${params.id}`}>
      <DocsEditor thesisId={params.id} reviewMode />
    </EditorErrorBoundary>
  );
}

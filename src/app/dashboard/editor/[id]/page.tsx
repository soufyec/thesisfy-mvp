"use client";

import { useParams } from "next/navigation";
import DocsEditor from "@/components/editor/DocsEditor";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  return <DocsEditor thesisId={params.id} />;
}

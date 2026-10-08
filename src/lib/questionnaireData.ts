import { db } from "@/lib/db";
import { QuestionnaireEdit, withEdits } from "@/lib/questionnaire";

/** Server side only: the current questionnaire, base content plus the team's stored additions. */
export function currentQuestionnaire() {
  return withEdits(db.questionnaire.edits() as unknown as QuestionnaireEdit[]);
}

import { FunctionDeclaration, Type } from "@google/genai";
import { fetchUserDocs, fetchUserDoc } from './firestore-rest';
import { analyzeExerciseProgression, extractExerciseHistory, calculateE1RM } from './progression';
import { validatePlanArgs, validateProposalArgs } from './validation';

export { validatePlanArgs, validateProposalArgs };

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "get_user_profile",
    description: "Returns relevant profile information for the authenticated user and their autonomy level.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "get_workouts",
    description: "Returns the user's scheduled, planned, and completed workouts with their version numbers, dates, and sets.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.INTEGER, description: "Max workouts to return (default 10)" }
      }
    }
  },
  {
    name: "get_recent_workouts",
    description: "Returns recent completed workouts.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.INTEGER, description: "Max number of completed workouts to return (default 5)" }
      }
    }
  },
  {
    name: "get_exercise_history",
    description: "Returns the user's historical performance for a specific exercise.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        exerciseId: { type: Type.STRING, description: "The ID or name of the exercise (e.g. bench_press, squat)" }
      },
      required: ["exerciseId"]
    }
  },
  {
    name: "get_progress",
    description: "Returns aggregate progress statistics like workout frequency, total volume, consistency, and trend.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "get_personal_records",
    description: "Returns the user's overall personal records (PRs: best weight and best e1RM) across all exercises computed from history.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "get_progression_analysis",
    description: "Runs FORGE's deterministic progression classifier on the user's workout history for a specific exercise or across all recent exercises. Returns status (PROGRESSING, STALLING, REGRESSING, INSUFFICIENT_DATA), e1RM trend, and calculated next session target.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        exerciseId: { type: Type.STRING, description: "The exercise identifier or name to analyze (e.g. 'bench_press', 'squat', 'Barbell Bench Press')" }
      },
      required: ["exerciseId"]
    }
  },
  {
    name: "propose_workout_change",
    description: "Proposes structured modifications to an existing Workout (sets, reps, weight, schedule date, title) for the user to review and approve. Always specify the target workout's baseVersion for OCC.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetEntityId: { type: Type.STRING, description: "The ID of the workout to modify" },
        baseVersion: { type: Type.INTEGER, description: "The exact current version of the target workout (OCC counter)" },
        summary: { type: Type.STRING, description: "Clear explanation of what was changed and why (e.g. Progressive overload: +2.5kg on Bench Press)" },
        afterState: {
          type: Type.OBJECT,
          description: "The complete proposed updated state for the workout",
          properties: {
            title: { type: Type.STRING },
            scheduledDate: { type: Type.STRING },
            status: { type: Type.STRING },
            sets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  exercise: { type: Type.STRING },
                  reps: { type: Type.INTEGER },
                  weight: { type: Type.NUMBER }
                },
                required: ["id", "exercise", "reps", "weight"]
              }
            }
          },
          required: ["title", "scheduledDate", "sets"]
        }
      },
      required: ["targetEntityId", "baseVersion", "summary", "afterState"]
    }
  },
  {
    name: "create_plan",
    description: "Proposes a new structured training plan for the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the plan (e.g. 5-Day Hypertrophy)" },
        goal: { type: Type.STRING, description: "The main goal of the plan" },
        days: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Name of the day (e.g. Push, Pull, Legs)" },
              exercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    exerciseId: { type: Type.STRING, description: "Exercise ID" },
                    targetSets: { type: Type.INTEGER },
                    targetRepsMin: { type: Type.INTEGER },
                    targetRepsMax: { type: Type.INTEGER }
                  },
                  required: ["exerciseId", "targetSets", "targetRepsMin", "targetRepsMax"]
                }
              }
            },
            required: ["name", "exercises"]
          }
        }
      },
      required: ["name", "goal", "days"]
    }
  }
];

export async function executeTool(
  name: string,
  args: any,
  context: { projectId: string; dbId: string; idToken: string; uid: string }
) {
  const { projectId, dbId, idToken, uid } = context;

  switch (name) {
    case 'get_user_profile': {
      const profile = await fetchUserDoc(projectId, dbId, idToken, 'users', uid);
      const permissions = await fetchUserDoc(projectId, dbId, idToken, 'user_permissions', uid);
      return { 
        profile: profile || { status: 'default' },
        permissions: permissions || { autonomyLevel: 'L2_GUIDED_AUTONOMY', permissionEpoch: 1 }
      };
    }

    case 'get_workouts': {
      const limit = typeof args?.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : 10;
      const workouts = await fetchUserDocs(projectId, dbId, idToken, 'workouts', uid, limit, 'scheduledDate', 'DESCENDING');
      return { workouts };
    }

    case 'get_recent_workouts': {
      const limit = typeof args?.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 20) : 5;
      const allWorkouts = await fetchUserDocs(projectId, dbId, idToken, 'workouts', uid, 50, 'scheduledDate', 'DESCENDING');
      const completed = allWorkouts.filter((w: any) => String(w.status).toUpperCase() === 'COMPLETED');
      return { workouts: completed.slice(0, limit) };
    }

    case 'get_exercise_history': {
      const exerciseId = String(args?.exerciseId || '').trim();
      const workouts = await fetchUserDocs(projectId, dbId, idToken, 'workouts', uid, 50, 'scheduledDate', 'DESCENDING');
      const history = extractExerciseHistory(workouts, exerciseId);
      return {
        exerciseId,
        history,
        totalSessions: history.length
      };
    }

    case 'get_progress': {
      const workouts = await fetchUserDocs(projectId, dbId, idToken, 'workouts', uid, 60, 'scheduledDate', 'DESCENDING');
      const completed = workouts.filter((w: any) => String(w.status).toUpperCase() === 'COMPLETED');
      
      let totalVolume = 0;
      let totalSets = 0;
      const volumesByWorkout: { id: string; date: string; volume: number }[] = [];

      for (const w of completed) {
        let wVol = 0;
        if (Array.isArray(w.sets)) {
          for (const s of w.sets) {
            const wt = Number(s.weight) || 0;
            const reps = Number(s.reps) || 0;
            if (wt > 0 && reps > 0) {
              wVol += wt * reps;
              totalSets++;
            }
          }
        }
        totalVolume += wVol;
        volumesByWorkout.push({
          id: w.id,
          date: w.scheduledDate || '',
          volume: wVol
        });
      }

      // Calculate consistency & weekly frequency over last 4 weeks
      const now = Date.now();
      const fourWeeksAgo = now - 28 * 24 * 60 * 60 * 1000;
      const recentWorkouts = completed.filter((w: any) => {
        const time = w.completedAt || (w.scheduledDate ? new Date(w.scheduledDate).getTime() : 0);
        return time >= fourWeeksAgo;
      });
      const avgWeeklyFrequency = Math.round((recentWorkouts.length / 4) * 10) / 10;
      const consistencyScore = Math.min(100, Math.round((recentWorkouts.length / 12) * 100)); // Target 3 workouts/week

      return {
        totalCompletedWorkouts: completed.length,
        totalVolumeKg: Math.round(totalVolume),
        totalSetsCompleted: totalSets,
        avgWeeklyFrequency,
        consistencyScore,
        recentWorkoutsVolume: volumesByWorkout.slice(0, 10)
      };
    }

    case 'get_personal_records': {
      const workouts = await fetchUserDocs(projectId, dbId, idToken, 'workouts', uid, 100, 'scheduledDate', 'DESCENDING');
      const completed = workouts.filter((w: any) => String(w.status).toUpperCase() === 'COMPLETED');

      const prMap: Record<string, { exercise: string; bestWeight: number; bestE1RM: number; date: string; repsAtBestWeight: number }> = {};

      for (const w of completed) {
        if (!Array.isArray(w.sets)) continue;
        const date = w.scheduledDate || '';
        for (const s of w.sets) {
          const exName = String(s.exercise || '').trim();
          if (!exName) continue;
          const wt = Number(s.weight) || 0;
          const reps = Number(s.reps) || 0;
          if (wt <= 0 || reps <= 0) continue;

          const e1rm = calculateE1RM(wt, reps, s.rir);
          const key = exName.toLowerCase().replace(/[-_\s]+/g, '');

          if (!prMap[key]) {
            prMap[key] = {
              exercise: exName,
              bestWeight: wt,
              repsAtBestWeight: reps,
              bestE1RM: e1rm,
              date
            };
          } else {
            if (wt > prMap[key].bestWeight) {
              prMap[key].bestWeight = wt;
              prMap[key].repsAtBestWeight = reps;
              prMap[key].date = date;
            }
            if (e1rm > prMap[key].bestE1RM) {
              prMap[key].bestE1RM = e1rm;
            }
          }
        }
      }

      return {
        personalRecords: Object.values(prMap)
      };
    }

    case 'get_progression_analysis': {
      const workouts = await fetchUserDocs(projectId, dbId, idToken, 'workouts', uid, 50, 'scheduledDate', 'DESCENDING');
      const analysis = analyzeExerciseProgression(workouts, args.exerciseId);
      return {
        analysis
      };
    }

    case 'propose_workout_change': {
      validateProposalArgs(args);
      return {
        status: "PROPOSAL_VALIDATED",
        proposal: args
      };
    }

    case 'create_plan': {
      validatePlanArgs(args);
      return {
        status: "PLAN_VALIDATED",
        plan: args
      };
    }

    default:
      throw new Error(`Tool ${name} not implemented`);
  }
}

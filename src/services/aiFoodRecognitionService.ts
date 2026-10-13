import {
  FoodEntryDraft,
  FoodRecognitionCandidate,
  FoodRecognitionProvider,
  FoodRecognitionResult,
  MealType,
} from '../types/domain';

/**
 * Phase 2 Extension Architecture: Pluggable AI Food Recognition Registry & Adapter.
 *
 * By standardizing `FoodRecognitionProvider` -> `FoodEntryDraft`, Phase 2 vision/LLM
 * food recognition can be registered here without modifying the Firestore schema,
 * security rules, nutrition calculation engine, or diary components.
 */
export function convertRecognitionCandidateToDraft(
  candidate: FoodRecognitionCandidate,
  params: {
    providerId: string;
    modelVersion: string;
    recognizedAt: string;
    date: string;
    mealType: MealType;
    loggedAt: string;
  }
): FoodEntryDraft {
  return {
    date: params.date,
    mealType: params.mealType,
    loggedAt: params.loggedAt,
    name: candidate.name,
    quantity: candidate.estimatedQuantity,
    unit: candidate.estimatedUnit,
    servingGrams: candidate.estimatedServingGrams,
    servingDescription: `${candidate.estimatedQuantity} ${candidate.estimatedUnit} (${candidate.estimatedServingGrams}g est.)`,
    nutrition: candidate.nutrition,
    dataQuality: 'ai_estimate',
    sourceType: 'ai_recognition',
    notes: candidate.notes || 'AI-estimated nutrition — please review and adjust if needed.',
    aiMetadata: {
      providerId: params.providerId,
      modelVersion: params.modelVersion,
      confidenceScore: candidate.confidenceScore,
      recognizedAt: params.recognizedAt,
      userReviewed: true,
      rawDetectedLabel: candidate.name,
    },
  };
}

class Phase1PlaceholderAiProvider implements FoodRecognitionProvider {
  readonly id = 'phase2-ai-vision-slot';
  readonly displayName = 'AI Meal Recognition (Phase 2 Architecture Ready)';
  readonly isAvailable = false;

  async analyzeImage(): Promise<FoodRecognitionResult> {
    throw new Error(
      'AI photo recognition is scheduled for Phase 2. Please use Verified Search, Recent Foods, Recipes, or Manual Entry.'
    );
  }

  async analyzeDescription(): Promise<FoodRecognitionResult> {
    throw new Error(
      'AI natural-language recognition is scheduled for Phase 2. Please use Verified Search, Recent Foods, Recipes, or Manual Entry.'
    );
  }

  candidateToFoodEntryDraft(
    candidate: FoodRecognitionCandidate,
    date: string,
    mealType: MealType,
    loggedAt: string
  ): FoodEntryDraft {
    return convertRecognitionCandidateToDraft(candidate, {
      providerId: this.id,
      modelVersion: 'phase2-v1',
      recognizedAt: new Date().toISOString(),
      date,
      mealType,
      loggedAt,
    });
  }
}

class AiFoodRecognitionRegistry {
  private activeProvider: FoodRecognitionProvider = new Phase1PlaceholderAiProvider();

  registerProvider(provider: FoodRecognitionProvider): void {
    this.activeProvider = provider;
  }

  getProvider(): FoodRecognitionProvider {
    return this.activeProvider;
  }
}

export const aiFoodRecognitionRegistry = new AiFoodRecognitionRegistry();

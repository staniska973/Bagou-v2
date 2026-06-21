import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { getTranslations } from "@/lib/i18n";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { toneEnum, riskLevelEnum, modeEnum, tuVousEnum } from "@shared/schema";
import bagouIcon from "../assets/images/bagou-icon.png";

const TOTAL_STEPS = 6;

type ObjectiveKey = "SOCIAL" | "PRO" | "DAILY" | "RELATIONNEL" | "DIFFICULT" | "STORY";

interface OnboardingData {
  language: "fr" | "en";
  objectives: ObjectiveKey[];
  tonePrimary: string;
  toneSecondary: string;
  riskLevel: string;
  primaryMode: string;
  allowSarcasm: boolean;
  allowExplicitFlirt: boolean;
  allowSwearing: boolean;
  tuVous: string;
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { language } = useAppStore();
  const { user } = useAuth();
  const t = getTranslations(language);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    language: language,
    objectives: [],
    tonePrimary: "classy_calm",
    toneSecondary: "warm_empathetic",
    riskLevel: "safe",
    primaryMode: "text",
    allowSarcasm: true,
    allowExplicitFlirt: false,
    allowSwearing: false,
    tuVous: "tu",
  });

  const createProfile = useMutation({
    mutationFn: async (profileData: OnboardingData) => {
      const res = await apiRequest("POST", "/api/profiles", {
        ...profileData,
        userId: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/user"] });
      navigate("/");
    },
  });

  const objectives: { key: ObjectiveKey; label: string }[] = [
    { key: "SOCIAL", label: "Social" },
    { key: "PRO", label: "Pro" },
    { key: "DAILY", label: "Quotidien" },
    { key: "RELATIONNEL", label: "Relationnel" },
    { key: "DIFFICULT", label: "Difficile" },
    { key: "STORY", label: "Storytelling" },
  ];

  const tones = toneEnum;

  const toggleObjective = (obj: ObjectiveKey) => {
    setData((prev) => ({
      ...prev,
      objectives: prev.objectives.includes(obj)
        ? prev.objectives.filter((o) => o !== obj)
        : [...prev.objectives, obj],
    }));
  };

  const canProceed = () => {
    if (step === 2) return data.objectives.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      createProfile.mutate(data);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <img src={bagouIcon} alt="Bagou" className="w-12 h-12 object-contain mx-auto mb-3" data-testid="img-onboarding-logo" />
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">{t.onboarding.step} {step} {t.onboarding.of} {TOTAL_STEPS}</span>
            </div>
            <Progress value={(step / TOTAL_STEPS) * 100} className="h-2 mb-6" />
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === 1 && (
                <StepContainer title={t.onboarding.language.title} description={t.onboarding.language.description}>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { code: "fr", label: "Français", flag: "FR" },
                      { code: "en", label: "English", flag: "EN" },
                    ].map((lang) => (
                      <Card
                        key={lang.code}
                        className={`cursor-pointer hover-elevate transition-all ${
                          data.language === lang.code
                            ? "ring-2 ring-primary bg-primary/5"
                            : ""
                        }`}
                        onClick={() => setData((prev) => ({ ...prev, language: lang.code as "fr" | "en" }))}
                        data-testid={`card-lang-${lang.code}`}
                      >
                        <CardContent className="p-6 text-center">
                          <span className="text-4xl mb-3 block">{lang.flag}</span>
                          <span className="font-medium">{lang.label}</span>
                          {data.language === lang.code && (
                            <Check className="w-5 h-5 text-primary mx-auto mt-2" />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </StepContainer>
              )}

              {step === 2 && (
                <StepContainer title={t.onboarding.objectives.title} description={t.onboarding.objectives.description}>
                  <div className="grid grid-cols-2 gap-3">
                    {objectives.map((obj) => {
                      const label = t.onboarding.objectives[obj.key.toLowerCase() as keyof typeof t.onboarding.objectives] || obj.label;
                      const desc = t.onboarding.objectives[`${obj.key.toLowerCase()}Desc` as keyof typeof t.onboarding.objectives] || "";
                      return (
                        <Card
                          key={obj.key}
                          className={`cursor-pointer hover-elevate transition-all ${
                            data.objectives.includes(obj.key)
                              ? "ring-2 ring-primary bg-primary/5"
                              : ""
                          }`}
                          onClick={() => toggleObjective(obj.key)}
                          data-testid={`card-obj-${obj.key}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{label}</p>
                                <p className="text-xs text-muted-foreground truncate">{desc}</p>
                              </div>
                              {data.objectives.includes(obj.key) && (
                                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </StepContainer>
              )}

              {step === 3 && (
                <StepContainer title={t.onboarding.tone.title} description={t.onboarding.tone.description}>
                  <div className="space-y-3">
                    {tones.map((tone) => {
                      const label = t.onboarding.tone[tone as keyof typeof t.onboarding.tone] || tone;
                      return (
                        <Card
                          key={tone}
                          className={`cursor-pointer hover-elevate transition-all ${
                            data.tonePrimary === tone
                              ? "ring-2 ring-primary bg-primary/5"
                              : ""
                          }`}
                          onClick={() => setData((prev) => ({ ...prev, tonePrimary: tone }))}
                          data-testid={`card-tone-${tone}`}
                        >
                          <CardContent className="p-4 flex items-center justify-between">
                            <span className="font-medium">{label}</span>
                            {data.tonePrimary === tone && (
                              <Check className="w-5 h-5 text-primary" />
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </StepContainer>
              )}

              {step === 4 && (
                <StepContainer title={t.onboarding.riskLevel.title} description={t.onboarding.riskLevel.description}>
                  <div className="space-y-3">
                    {riskLevelEnum.map((level) => {
                      const label = t.onboarding.riskLevel[level];
                      const desc = t.onboarding.riskLevel[`${level}Desc` as keyof typeof t.onboarding.riskLevel];
                      return (
                        <Card
                          key={level}
                          className={`cursor-pointer hover-elevate transition-all ${
                            data.riskLevel === level
                              ? "ring-2 ring-primary bg-primary/5"
                              : ""
                          }`}
                          onClick={() => setData((prev) => ({ ...prev, riskLevel: level }))}
                          data-testid={`card-risk-${level}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{label}</p>
                                <p className="text-sm text-muted-foreground">{desc}</p>
                              </div>
                              {data.riskLevel === level && (
                                <Check className="w-5 h-5 text-primary" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </StepContainer>
              )}

              {step === 5 && (
                <StepContainer title={t.onboarding.mode.title} description={t.onboarding.mode.description}>
                  <div className="space-y-3">
                    {modeEnum.map((mode) => {
                      const label = t.onboarding.mode[mode];
                      const desc = t.onboarding.mode[`${mode}Desc` as keyof typeof t.onboarding.mode];
                      return (
                        <Card
                          key={mode}
                          className={`cursor-pointer hover-elevate transition-all ${
                            data.primaryMode === mode
                              ? "ring-2 ring-primary bg-primary/5"
                              : ""
                          }`}
                          onClick={() => setData((prev) => ({ ...prev, primaryMode: mode }))}
                          data-testid={`card-mode-${mode}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{label}</p>
                                <p className="text-sm text-muted-foreground">{desc}</p>
                              </div>
                              {data.primaryMode === mode && (
                                <Check className="w-5 h-5 text-primary" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </StepContainer>
              )}

              {step === 6 && (
                <StepContainer title={t.onboarding.limits.title} description={t.onboarding.limits.description}>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sarcasm" className="cursor-pointer">
                        {t.onboarding.limits.allowSarcasm}
                      </Label>
                      <Switch
                        id="sarcasm"
                        checked={data.allowSarcasm}
                        onCheckedChange={(checked) =>
                          setData((prev) => ({ ...prev, allowSarcasm: checked }))
                        }
                        data-testid="switch-sarcasm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="flirt" className="cursor-pointer">
                        {t.onboarding.limits.allowExplicitFlirt}
                      </Label>
                      <Switch
                        id="flirt"
                        checked={data.allowExplicitFlirt}
                        onCheckedChange={(checked) =>
                          setData((prev) => ({ ...prev, allowExplicitFlirt: checked }))
                        }
                        data-testid="switch-flirt"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="swearing" className="cursor-pointer">
                        {t.onboarding.limits.allowSwearing}
                      </Label>
                      <Switch
                        id="swearing"
                        checked={data.allowSwearing}
                        onCheckedChange={(checked) =>
                          setData((prev) => ({ ...prev, allowSwearing: checked }))
                        }
                        data-testid="switch-swearing"
                      />
                    </div>
                    <div className="pt-4 border-t">
                      <Label className="mb-3 block">{t.onboarding.limits.tuVous}</Label>
                      <div className="flex gap-3">
                        {tuVousEnum.map((option) => (
                          <Button
                            key={option}
                            variant={data.tuVous === option ? "default" : "outline"}
                            onClick={() => setData((prev) => ({ ...prev, tuVous: option }))}
                            className="flex-1"
                            data-testid={`button-tuvous-${option}`}
                          >
                            {t.onboarding.limits[option]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </StepContainer>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} className="flex-1" data-testid="button-back">
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t.onboarding.back}
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed() || createProfile.isPending}
              className="flex-1"
              data-testid="button-next"
            >
              {createProfile.isPending ? (
                t.common.loading
              ) : step === TOTAL_STEPS ? (
                t.onboarding.finish
              ) : (
                <>
                  {t.onboarding.next}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepContainer({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6">{description}</p>
      {children}
    </div>
  );
}

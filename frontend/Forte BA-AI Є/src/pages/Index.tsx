import ChatInterface from "@/components/ChatInterface";
import { motion } from "framer-motion";
import { Building2, FileText, GitBranch, Target, MessageSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const Index = () => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-md">
                <Building2 className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Forte BA Assistant</h1>
                <p className="text-xs text-muted-foreground">AI Бизнес-Аналитик</p>
              </div>
            </div>
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 px-3">
                    <MessageSquare className="mr-2 h-4 w-4" /> Возможности
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0">
                  <div className="h-full overflow-y-auto bg-card">
                    <div className="p-6 border-b border-border">
                      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        Возможности
                      </h2>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 transition-colors">
                          <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <h3 className="font-medium text-sm">Сбор требований</h3>
                            <p className="text-xs text-muted-foreground mt-1">Структурирование бизнес-требований</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 transition-colors">
                          <GitBranch className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <h3 className="font-medium text-sm">Артефакты</h3>
                            <p className="text-xs text-muted-foreground mt-1">Use Case, диаграммы, User Stories</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 transition-colors">
                          <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                          <div>
                            <h3 className="font-medium text-sm">Документация</h3>
                            <p className="text-xs text-muted-foreground mt-1">Автоматическая генерация документов</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 h-[calc(100vh-88px)]">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
          {/* Sidebar with capabilities */}
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-1 space-y-4 hidden lg:block"
          >
            <div className="bg-card rounded-2xl p-6 border border-border shadow-md">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Возможности
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 transition-colors hover:bg-muted">
                  <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm">Сбор требований</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Структурирование бизнес-требований
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 transition-colors hover:bg-muted">
                  <GitBranch className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm">Артефакты</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use Case, диаграммы, User Stories
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 transition-colors hover:bg-muted">
                  <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm">Документация</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Автоматическая генерация документов
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.aside>

          {/* Chat Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-3 bg-card rounded-2xl shadow-lg border border-border overflow-hidden flex flex-col"
          >
            <ChatInterface />
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Index;

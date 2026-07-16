/**
 * ============================================================================
 * CONFIGURAÇÃO DO SEU CANAL
 * ============================================================================
 * Este é o único arquivo de código que você PRECISA editar para adaptar
 * o pipeline ao seu canal. Tudo aqui vira contexto para a IA gerar títulos,
 * descrições e hashtags no tom que você quer.
 *
 * Quanto mais específico e verdadeiro você for aqui, melhores serão os
 * metadados gerados. Prompt genérico → resultado genérico.
 * ============================================================================
 */

export const channelConfig = {
  /** Nome do canal — aparece no painel de status e é citado no prompt da IA. */
  name: "Meu Canal",

  /** Descrição curta em uma frase. Ex: "um canal brasileiro sobre culinária vegana". */
  description: "um canal sobre [descreva aqui o nicho]",

  /**
   * O prompt sobre o canal. Este texto vai direto para a IA a cada geração
   * de metadados, então seja específico. Sugestões de tópicos a incluir:
   *
   *  - Temas cobertos (nicho, subtemas recorrentes, produtos/marcas frequentes)
   *  - Nome que você dá à audiência (se tiver — ex: "o clã", "galera", "família")
   *  - Saudação de abertura característica (ex: "Salve!", "E aí, pessoal!")
   *  - Tom de voz (casual, técnico, humorístico, nostálgico, formal…)
   *  - Formatos de título que provaram funcionar no seu canal
   *  - Vocabulário e expressões da sua "voz" que aparecem em vários vídeos
   *
   * Não invente características que o canal não tem — a IA vai levar a sério
   * e produzir conteúdo que soa falso pra quem te acompanha.
   */
  context: `
SOBRE O CANAL:
- Temas: [descreva os assuntos que o canal cobre]
- Audiência: [se você chama a audiência de algo específico, diga aqui; se não, diga "espectadores em geral"]
- Saudação característica: [ex: "E aí, galera!" — deixe em branco se não tiver]
- Tom: [ex: casual, direto, humorístico, com nostalgia, técnico, energético…]

FORMATOS DE TÍTULO QUE FUNCIONAM NESTE CANAL:
- [padrão 1 — ex: "Como fazer X em Y minutos"]
- [padrão 2 — ex: "O erro que todo mundo comete em Z"]
- [padrão 3 — ex: "5 coisas que ninguém te contou sobre W"]

VOCABULÁRIO/EXPRESSÕES RECORRENTES: [liste palavras que você usa muito, se houver]
  `.trim(),

  /** Idioma dos textos gerados. */
  language: "português brasileiro",

  /**
   * CTAs (chamadas para ação) usados no segundo parágrafo da descrição.
   * O bom CTA é ligado ao formato da plataforma: no YouTube inscrição
   * funciona; no Instagram salvar/comentar rende mais que "se inscreva";
   * no Facebook compartilhar tem alcance maior.
   */
  cta: {
    youtube: "inscrição no canal (para ver mais conteúdo assim)",
    instagram: "comentário e salvar (ajuda muito o alcance no Reels)",
    facebook: "compartilhamento (ajude a espalhar!)",
  },

  /**
   * Categoria do YouTube (usado no upload).
   * Consulte a lista em: https://developers.google.com/youtube/v3/docs/videoCategories/list
   * Alguns valores comuns:
   *   1 = Film & Animation    | 10 = Music           | 15 = Pets & Animals
   *   17 = Sports             | 19 = Travel & Events | 20 = Gaming
   *   22 = People & Blogs     | 23 = Comedy          | 24 = Entertainment
   *   25 = News & Politics    | 26 = Howto & Style   | 27 = Education
   *   28 = Science & Tech
   */
  youtubeCategoryId: "22",
};

import type { SpeechWaveState } from "./types.js";

export type SpeechTemplate = {
  phrase: string;
  targetWords: string[];
};

const CHINESE_CORPUS = [
  "这就是人世间，有一个人走向死亡，可是无限眷恋晚霞映照下的生活；另两个人寻欢作乐，可是不知道落日的余晖有多么的美丽。",
  "我想无论是写作还是人生，正确的出发都是走进窄门。不要被宽阔的大门所迷惑，那里面的路没有多长。",
  "宋钢在门外咯咯地笑了起来，李光头听到了宋钢的笑声后，也破涕为笑了。李光头哭一声笑一声，又笑一声哭一声。后来两个孩子靠着门板坐在了地上，隔着门板背靠背说了很多话。",
  "这是两个孩子第一次在夜晚看到大海，夜晚的大海神秘莫测和变化多端，让他们一阵激动，忍不住尖声喊叫起来，这次宋凡平没有捂住他们的嘴，他的大手摸着他们的头发，让他们叫个不停，他自己出神地看着黑暗中的大海。",
  "我一直在想究竟是一种怎样的力量让我们活下来，现在这就是人世间，有一个人走向死亡，可是无限眷恋晚霞映照下的生活；另两个人寻欢作乐，可是不知道落日的余晖有多么的美丽。我知道，是家庭。",
  "从今天起，你们就是兄弟，你们要亲如手足，你们要互相帮助，你们要有福同享有难同当，你们要好好学习天天向上……。",
  "我一直觉得中华民族是一个奇妙的民族。几千年来这个民族所经历的苦难足以令数个民族都灭绝得干干净净，然而我们活下来了，而且一代又一代繁衍得非常好。",
  "她一直跪在那里，她将所有染血的泥土都捧在衣服上以后，仍然跪在那里，他的手在地上的泥土里拨弄着，像是在沙子里寻找金子似的，继续在泥土里寻找宋凡平的血迹。",
  "凝视着河水里的月光闪闪发光，一波一波永无止境的荡漾过去，她抬起头来时，河边的树木在月光里安静得像是睡眠中的树木，伸向空中的树梢挂满了月光，散发和水一样的波纹，还有飞舞的萤火虫，她们在黑暗里上下跳跃前后飞翔时起伏不止，像是歌声那样起伏。",
  "他想象中地球的壮丽情景，就是母亲抱着他第一次站在南门外所见到的情景，田野在月光下无限的伸展，李光头婴儿时的目光像俄罗斯联盟号飞船一样飞翔过去。",
  "黑暗中我和你走了，有了光你把我扔了。",
  "一个西方人活四百年才能经历这样两个天壤之别的时代，一个中国人只需四十年就经历了。",
  "宋刚低头坐在那里，此刻遥远的往事雪花飞般的来到，他和李光头的共同经历仿佛是一条雪中的道路，慢慢的延伸到了现在，然后突然消失了。宋刚思绪万千，可是又茫然不知所向，仿佛是皑皑白雪覆盖了所有的道路，也覆盖了所有的方向。",
  "他们像野草一样被脚步踩了又踩，被车轮辗了又辗，可是仍然生机勃勃地成长起来了。",
  "李光头的眼睛透过落地窗玻璃，看着亮晶晶深远的夜空，满脸浪漫的情怀，他说要把宋钢的骨灰盒放在太空的轨道上，放在每天可以看见十六次日出和十六次日落的太空轨道上，宋钢就会永远傲游在月亮和星星之间了。",
  "然后他深深地吸了一口人世间的空气，重新戴上口罩，那时候他忘记了，死人是不会呼吸的，他怕自己的肺病会传染给收尸的人。",
  "再他舍不得自己的眼镜，怕被火车轧坏，他取下来放在了自己刚才坐着的石头上，又觉得不明显，他脱下了自己的上衣，把上衣铺在石头上，再把眼镜放上去。",
  "李光头知道是他的揭发把宋凡平送进了那个像牢房一样的仓库，晚上睡觉的时候，他就会想起宋凡平在台阶上被人乱踩乱蹬的情景，宋凡平的眼睛还在惊惶地寻找他和宋钢。",
  "即使有太多的不解，我们总能并肩走过最艰难的岁月。",
  "这时他听到了列车遥远的汽笛声，他取下眼镜擦了擦，戴上后看到半个夕阳掉下去了，火车从掉下去的半个夕阳里驶了出来，他站起了来，告诉自己离开人世的时候到了。",
  "我感到自己像是一棵回到森林的树，一滴回到河流的水，一粒回到泥土的尘埃。戴着黑纱的陆续坐了下来，仿佛是声音陆续降落到安静里。",
  "我们围坐在篝火旁，宽广的沉默里暗暗涌动千言万语，那是很多的卑微人生在自我诉说。",
  "每一个在那个离去的世界里都有着不愿回首的辛酸事，每一个都是那里的孤苦伶仃者。",
  "我们自己悼念自己聚集到一起，可是当我们围坐在绿色的篝火四周之时，我们不再孤苦伶仃。",
  "没有说话，没有动作，只有无声的相视而笑。我们坐在静默里，不是为了别的什么，只是为了感受我们不是一个，而是一群。",
  "我在静默的围坐里听到火的声音，是舞动声；听到水的声音，是敲击声；听到草的声音，是摇曳声；听到树的声音，是呼唤声；听到风的声音，是沙沙声，听到云的声音，是漂浮声这些声音仿佛是在向我们倾诉，它们也是命运多舛，它们也是不愿回首。",
  "然后，我听到夜莺般的歌声飞来了，飞过来一段停顿一下，又飞过来一段·····",
  "以笑的方式哭，在死亡的伴随下活着。",
  "没有什么比时间更具有说服力了，因为时间无需通知我们就可以改变一切。",
  "我知道黄昏正在转瞬即逝，黑夜从天而降了。我看到广阔的土地袒露着结实的胸膛，那是召唤的姿态，就像女人召唤着她们的儿女，土地召唤着黑夜来临。",
  "最初我们来到这个世界，是因为不得不来；最终我们离开这个世界，是因为不得不走。",
  "死了的人已死去，活着的人继续好好的活着。",
  "为一个词语，“活着”在语言里充满了力量，它的力量不是来自于喊叫，也不是来自于进攻，而是忍受，去忍受生命赋予我们的责任，去忍受现实给予我们的幸福和苦难、无聊和平庸。",
  "内心让他真实地了解自己，一旦了解了自己也就了解了世界。",
  "人是为了活着而活着。",
  "人是为活着本身而活着，而不是为了活着之外的任何事物所活着。",
  "那一年的整个夏天，我就如同一只乱飞的麻雀，游荡在知了和阳光充斥的村舍田野。",
  "他们对自己的经历缺乏热情，仿佛是道听途说般地只记得零星几点，即便是这零星几点也都是自身之外的记忆，用一、两句话表达了他们所认为的一切。",
  "人啊，活着时受了再多的苦，到了快死的时候也会想个法子来宽慰自己。",
  "他们脸上的皱纹里积满了阳光和泥土，他们向我微笑时，我看到空洞的嘴里牙齿所剩无几。他们时常流出浑浊的眼泪，这倒不是因为他们时常悲伤，他们在高兴时甚至是在什么事都没有的平静时刻，也会泪流而出。然后举起和乡间泥路一样粗糙的手指，擦去眼泪，如同掸去身上的稻草。",
] as const;

const ENGLISH_CORPUS = [
  "I see a red bird on the tree.",
  "She drinks warm milk every morning.",
  "The cat runs after a small ball.",
  "We walk to the park after school.",
  "He opens the blue wooden box.",
  "My dog likes to play outside.",
  "You can pick the yellow flower.",
  "It rains softly in spring.",
  "They share a piece of bread.",
  "Mom puts apples on the table.",
  "The sun comes up early today.",
  "I hold a thin paper in my hand.",
  "She waves to her old friend.",
  "We watch fish swim in the pond.",
  "He closes the door slowly.",
  "A butterfly flies above grass.",
  "You may sit on this chair.",
  "The wind moves the green leaves.",
  "They clean the small room.",
  "Dad buys fresh fruit for us.",
  "I hear a soft knock at the door.",
  "She carries a light bag.",
  "We count ten white stones.",
  "The boy jumps over the line.",
  "He finds a round stone there.",
  "My sister draws a cute rabbit.",
  "You can turn on the lamp.",
  "A bird sings in the quiet bush.",
  "They talk about their trip.",
  "The boat floats on the lake.",
  "I touch the smooth rock.",
  "She feeds the little duck.",
  "We look up at the white cloud.",
  "He takes off his hat.",
  "The rabbit eats green carrots.",
  "You can put the book down.",
  "They run along the path.",
  "I smell sweet summer flowers.",
  "She folds her clean cloth.",
  "We wait for the bus together.",
] as const;

const CHINESE_KEYWORDS = [
  "人世间",
  "走向死亡",
  "晚霞",
  "生活",
  "余晖",
  "窄门",
  "李光头",
  "宋钢",
  "宋凡平",
  "笑声",
  "哭",
  "笑",
  "一声",
  "门板",
  "大海",
  "黑暗",
  "家庭",
  "兄弟",
  "泥土",
  "月光",
  "树木",
  "萤火虫",
  "火车",
  "眼镜",
  "夕阳",
  "仓库",
  "台阶",
  "世界",
  "活着",
  "时间",
  "土地",
  "生命",
  "道路",
  "方向",
  "母亲",
  "孩子",
  "声音",
  "歌声",
  "篝火",
  "命运",
  "阳光",
  "田野",
  "飞船",
  "等待",
] as const;

const ENGLISH_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "over", "under",
  "after", "before", "they", "them", "their", "there", "where", "when", "what",
  "which", "while", "with", "have", "has", "had", "you", "your", "can", "may",
  "will", "would", "could", "should", "very", "just", "also", "than", "then",
]);

function chineseTargets(phrase: string): string[] {
  const targets = CHINESE_KEYWORDS.filter((word) => phrase.includes(word)).slice(0, 6);
  if (targets.length >= 2) {
    return [...new Set(targets)];
  }
  return phrase
    .split(/[，。；！？、……：]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .sort((left, right) => right.length - left.length)
    .slice(0, 3)
    .map((part) => part.slice(0, 4));
}

function englishTargets(phrase: string): string[] {
  const words = phrase
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !ENGLISH_STOPWORDS.has(word));
  return [...new Set(words)]
    .sort((left, right) => right.length - left.length)
    .slice(0, 4);
}

function template(phrase: string, targetWords?: string[]): SpeechTemplate {
  return {
    phrase,
    targetWords:
      targetWords ??
      (/[\u3400-\u9fff]/.test(phrase) ? chineseTargets(phrase) : englishTargets(phrase)),
  };
}

export const SPEECH_TEMPLATES: SpeechTemplate[] = [
  template("I like apples, apples are good for our health.", ["apples"]),
  template(
    "宋钢在门外咯咯地笑了起来，李光头听到了宋钢的笑声后，也破涕为笑了。李光头哭一声笑一声，又笑一声哭一声。后来两个孩子靠着门板坐在了地上，隔着门板背靠背说了很多话。",
    ["李光头", "宋钢", "笑", "哭", "一声", "门板"],
  ),
  ...CHINESE_CORPUS.map((phrase) => template(phrase)),
  ...ENGLISH_CORPUS.map((phrase) => template(phrase)),
];

export function createSpeechWave(templateValue: SpeechTemplate): SpeechWaveState {
  const focusWindows = templateValue.targetWords
    .filter((targetWord) => targetWord.length > 0)
    .map((targetWord) => {
      const index = templateValue.phrase.indexOf(targetWord);
      if (index < 0) {
        return undefined;
      }
      const padding =
        Math.max(1, Math.ceil(targetWord.length * 0.5)) /
        Math.max(1, templateValue.phrase.length);
      return {
        targetWord,
        start: Math.max(0, index / templateValue.phrase.length - padding),
        end: Math.min(
          1,
          (index + targetWord.length) / templateValue.phrase.length + padding,
        ),
      };
    })
    .filter((window): window is NonNullable<typeof window> => Boolean(window));
  const firstWindow = focusWindows[0] ?? {
    targetWord: templateValue.targetWords[0] ?? templateValue.phrase,
    start: 0,
    end: 1,
  };
  return {
    phrase: templateValue.phrase,
    targetWords: templateValue.targetWords,
    focusWindows,
    focusStart: firstWindow.start,
    focusEnd: firstWindow.end,
    takeCount: 3,
  };
}

function clampWindow(frames: number[][], start: number, end: number): number[][] {
  if (frames.length === 0) {
    return [];
  }
  const from = Math.max(0, Math.floor(frames.length * start));
  const to = Math.min(frames.length, Math.max(from + 4, Math.ceil(frames.length * end)));
  return frames.slice(from, to);
}

function normalizeFrames(frames: number[][]): number[][] {
  const dimension = frames[0]?.length ?? 0;
  if (dimension === 0) {
    return frames;
  }
  const means = Array.from({ length: dimension }, (_, index) => {
    return frames.reduce((total, frame) => total + (frame[index] ?? 0), 0) / frames.length;
  });
  const deviations = Array.from({ length: dimension }, (_, index) => {
    const variance =
      frames.reduce((total, frame) => {
        const delta = (frame[index] ?? 0) - (means[index] ?? 0);
        return total + delta * delta;
      }, 0) / frames.length;
    return Math.sqrt(variance) || 1;
  });
  return frames.map((frame) =>
    frame.map(
      (value, index) => (value - (means[index] ?? 0)) / (deviations[index] ?? 1),
    ),
  );
}

function frameDistance(left: number[], right: number[]): number {
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    total += delta * delta;
  }
  return Math.sqrt(total / Math.max(1, length));
}

function dtwDistance(left: number[][], right: number[][]): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const previous = new Float64Array(columns).fill(Number.POSITIVE_INFINITY);
  const current = new Float64Array(columns).fill(Number.POSITIVE_INFINITY);
  previous[0] = 0;
  for (let row = 1; row < rows; row += 1) {
    current.fill(Number.POSITIVE_INFINITY);
    current[0] = 0;
    for (let column = 1; column < columns; column += 1) {
      const cost = frameDistance(left[row - 1] ?? [], right[column - 1] ?? []);
      current[column] = cost + Math.min(
        previous[column] ?? Number.POSITIVE_INFINITY,
        current[column - 1] ?? Number.POSITIVE_INFINITY,
        previous[column - 1] ?? Number.POSITIVE_INFINITY,
      );
    }
    previous.set(current);
  }
  return (previous[columns - 1] ?? Number.POSITIVE_INFINITY) / Math.max(left.length, right.length);
}

export function speechTakesValid(
  state: SpeechWaveState,
  takes: number[][][] | undefined,
): boolean {
  if (!takes || takes.length !== state.takeCount) {
    return false;
  }
  const dimensions = takes[0]?.length ? (takes[0][0]?.length ?? 0) : 0;
  if (dimensions < 5) {
    return false;
  }
  const windows: number[][][] = [];
  for (const take of takes) {
    if (
      take.length < 20 ||
      take.length > 160 ||
      take.some((frame) => frame.length !== dimensions)
    ) {
      return false;
    }
    windows.push(take);
  }

  const focusWindows = state.focusWindows.length > 0
    ? state.focusWindows
    : [{ targetWord: "phrase", start: state.focusStart, end: state.focusEnd }];
  for (const focusWindow of focusWindows) {
    const focused = windows.map((take) => {
      const focus = clampWindow(take, focusWindow.start, focusWindow.end);
      return focus.length >= 4 ? normalizeFrames(focus) : [];
    });
    if (focused.some((frames) => frames.length < 4)) {
      return false;
    }
    const distances = [
      dtwDistance(focused[0] ?? [], focused[1] ?? []),
      dtwDistance(focused[0] ?? [], focused[2] ?? []),
      dtwDistance(focused[1] ?? [], focused[2] ?? []),
    ];
    const minimum = Math.min(...distances);
    const maximum = Math.max(...distances);
    const average = distances.reduce((total, value) => total + value, 0) / distances.length;
    if (!(minimum > 0.018 && average > 0.04 && average < 1.65 && maximum < 2.8)) {
      return false;
    }
  }
  return true;
}

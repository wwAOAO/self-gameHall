import json
import math
import random
import sys
import traceback


RANK_VALUES = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    "J": 11,
    "Q": 12,
    "K": 13,
    "A": 14,
}
RANKS = list(RANK_VALUES.keys())
SUITS = ["spades", "hearts", "diamonds", "clubs"]


def card_key(card):
    return f"{card.get('rank')}:{card.get('suit')}"


def build_deck(excluded):
    excluded_keys = {card_key(card) for card in excluded}
    return [
        {"rank": rank, "value": RANK_VALUES[rank], "suit": suit}
        for suit in SUITS
        for rank in RANKS
        if f"{rank}:{suit}" not in excluded_keys
    ]


def value_counts(cards):
    counts = {}
    for card in cards:
        value = int(card["value"])
        counts[value] = counts.get(value, 0) + 1
    return counts


def straight_high(values):
    unique = sorted(set(values), reverse=True)
    if len(unique) != 5:
        return 0
    if unique == [14, 5, 4, 3, 2]:
        return 5
    return unique[0] if unique[0] - unique[4] == 4 else 0


def evaluate_five(cards):
    values = sorted([int(card["value"]) for card in cards], reverse=True)
    flush = all(card["suit"] == cards[0]["suit"] for card in cards)
    straight = straight_high(values)
    counts = sorted(value_counts(cards).items(), key=lambda item: (item[1], item[0]), reverse=True)

    if flush and straight:
        return (9, [straight])
    if counts[0][1] == 4:
        kicker = next(value for value, count in counts if count == 1)
        return (8, [counts[0][0], kicker])
    if counts[0][1] == 3 and len(counts) > 1 and counts[1][1] == 2:
        return (7, [counts[0][0], counts[1][0]])
    if flush:
        return (6, values)
    if straight:
        return (5, [straight])
    if counts[0][1] == 3:
        kickers = sorted([value for value, count in counts if count == 1], reverse=True)
        return (4, [counts[0][0], *kickers])
    if counts[0][1] == 2 and len(counts) > 1 and counts[1][1] == 2:
        pairs = sorted([value for value, count in counts if count == 2], reverse=True)
        kicker = next(value for value, count in counts if count == 1)
        return (3, [*pairs, kicker])
    if counts[0][1] == 2:
        kickers = sorted([value for value, count in counts if count == 1], reverse=True)
        return (2, [counts[0][0], *kickers])
    return (1, values)


def compare_eval(left, right):
    if left[0] != right[0]:
        return left[0] - right[0]
    max_len = max(len(left[1]), len(right[1]))
    for index in range(max_len):
        a = left[1][index] if index < len(left[1]) else 0
        b = right[1][index] if index < len(right[1]) else 0
        if a != b:
            return a - b
    return 0


def evaluate_best(cards):
    best = None
    n = len(cards)
    for a in range(n - 4):
        for b in range(a + 1, n - 3):
            for c in range(b + 1, n - 2):
                for d in range(c + 1, n - 1):
                    for e in range(d + 1, n):
                        current = evaluate_five([cards[a], cards[b], cards[c], cards[d], cards[e]])
                        if best is None or compare_eval(current, best) > 0:
                            best = current
    return best or evaluate_five(cards[:5])


def preflop_strength(hand):
    if len(hand) < 2:
        return 0.15
    first, second = sorted(hand, key=lambda card: int(card["value"]), reverse=True)
    high = int(first["value"])
    low = int(second["value"])
    pair = high == low
    suited = first["suit"] == second["suit"]
    gap = abs(high - low)
    score = (high + low) / 32.0
    if pair:
        score += 0.34 + high / 30.0
    if suited:
        score += 0.08
    if gap == 1:
        score += 0.07
    elif gap == 2:
        score += 0.03
    if high >= 12 and low >= 10:
        score += 0.12
    if high < 9 and low < 9 and not pair and gap > 2:
        score -= 0.12
    return max(0.05, min(0.98, score))


def estimate_win_rate(payload, iterations=350):
    hand = payload.get("hand") or []
    community = payload.get("communityCards") or []
    opponent_count = max(1, int(payload.get("opponentCount") or 1))
    if len(hand) < 2:
        return 0.2
    if len(community) < 3:
        return preflop_strength(hand)

    known = hand + community
    deck = build_deck(known)
    wins = 0.0
    trials = 0
    needed_board = 5 - len(community)
    needed_cards = needed_board + opponent_count * 2
    if needed_cards > len(deck):
        return preflop_strength(hand)

    for _ in range(iterations):
        sample = random.sample(deck, needed_cards)
        board = community + sample[:needed_board]
        cursor = needed_board
        hero_eval = evaluate_best(hand + board)
        tied = 1
        beaten = False

        for _opponent in range(opponent_count):
            opp_hand = sample[cursor:cursor + 2]
            cursor += 2
            opp_eval = evaluate_best(opp_hand + board)
            cmp_result = compare_eval(opp_eval, hero_eval)
            if cmp_result > 0:
                beaten = True
                break
            if cmp_result == 0:
                tied += 1

        trials += 1
        if not beaten:
            wins += 1.0 / tied

    return wins / trials if trials else preflop_strength(hand)


def choose_action(payload):
    legal = set(payload.get("legalActions") or [])
    call_amount = int(payload.get("callAmount") or 0)
    pot = max(1, int(payload.get("pot") or 0))
    chips = int(payload.get("chips") or 0)
    min_raise = max(20, int(payload.get("minRaise") or 20))
    current_bet = int(payload.get("currentBet") or 0)
    min_raise_to = int(payload.get("minRaiseTo") or (current_bet + min_raise))
    max_raise_to = int(payload.get("maxRaiseTo") or (current_bet + chips))
    phase = payload.get("phase") or "preflop"
    opponent_count = max(1, int(payload.get("opponentCount") or 1))

    iterations = 250 if phase == "preflop" else 420
    strength = estimate_win_rate(payload, iterations)
    pressure = call_amount / max(1.0, pot + call_amount)
    pot_odds = call_amount / max(1.0, pot + call_amount)

    can_raise = "raise" in legal and chips > call_amount + min_raise
    can_all_in = "all-in" in legal and chips > 0
    can_check = "check" in legal
    can_call = "call" in legal
    can_fold = "fold" in legal

    aggression = strength - pressure + (0.04 if opponent_count <= 1 else 0)
    if can_all_in and (strength >= 0.92 or (chips <= call_amount + min_raise and strength > pot_odds + 0.22)):
        return {"action": "all-in", "amount": int(chips), "source": "texas-ai-monte-carlo", "strength": strength}

    if can_raise and (strength >= 0.78 or (call_amount == 0 and strength >= 0.62 and random.random() < 0.35)):
        scale = 4 if strength >= 0.9 else 2
        raise_by = min(max(min_raise, min_raise * scale), max(min_raise, chips - call_amount))
        amount = min(max_raise_to, max(min_raise_to, current_bet + raise_by))
        return {"action": "raise", "amount": int(amount), "source": "texas-ai-monte-carlo", "strength": strength}

    if call_amount > 0:
        if can_fold and strength + 0.04 < pot_odds and aggression < 0.18:
            return {"action": "fold", "source": "texas-ai-monte-carlo", "strength": strength}
        if can_call:
            return {"action": "call", "source": "texas-ai-monte-carlo", "strength": strength}

    if can_check:
        return {"action": "check", "source": "texas-ai-monte-carlo", "strength": strength}
    if can_call:
        return {"action": "call", "source": "texas-ai-monte-carlo", "strength": strength}
    return {"action": "fold", "source": "texas-ai-monte-carlo", "strength": strength}


def status():
    try:
        import rlcard  # noqa: F401
        return {"available": True, "rlcard": True, "engine": "monte-carlo-ready"}
    except Exception as exc:
        return {"available": True, "rlcard": False, "engine": "monte-carlo", "rlcardError": str(exc)}


def respond(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            command = request.get("command")
            if command == "status":
                respond({"id": request_id, "ok": True, **status()})
                continue
            if command != "action":
                respond({"id": request_id, "ok": False, "error": f"Unknown command: {command}"})
                continue
            respond({"id": request_id, "ok": True, **choose_action(request.get("payload") or {})})
        except Exception as exc:
            respond({
                "id": request.get("id"),
                "ok": False,
                "error": str(exc),
                "traceback": traceback.format_exc(limit=5),
            })


if __name__ == "__main__":
    main()

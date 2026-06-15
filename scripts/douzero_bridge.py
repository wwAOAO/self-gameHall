import json
import os
import sys
import traceback


AGENTS = {}


def to_douzero_value(value):
    if value == 15:
        return 17
    if value == 16:
        return 20
    if value == 17:
        return 30
    return value


def from_douzero_value(value):
    if value == 17:
        return 15
    if value == 20:
        return 16
    if value == 30:
        return 17
    return value


def to_douzero_cards(values):
    return sorted(to_douzero_value(int(value)) for value in values)


def is_bomb(action):
    return len(action) == 4 and len(set(action)) == 1 or action == [20, 30]


def build_infoset(payload):
    from douzero.env.game import InfoSet

    position = payload["position"]
    player_index = int(payload["player"])
    player_positions = payload["playerPositions"]
    hands = payload["hands"]
    history = payload.get("history", [])

    infoset = InfoSet(position)
    infoset.player_hand_cards = to_douzero_cards(hands[player_index])
    infoset.legal_actions = [to_douzero_cards(action) for action in payload["legalActions"]]
    infoset.three_landlord_cards = to_douzero_cards(payload.get("landlordCards", []))

    infoset.num_cards_left_dict = {
        pos: len(hands[int(index)])
        for index, pos in player_positions.items()
    }

    infoset.other_hand_cards = []
    for index, pos in player_positions.items():
        if pos != position:
            infoset.other_hand_cards.extend(to_douzero_cards(hands[int(index)]))
    infoset.other_hand_cards.sort()

    infoset.last_move_dict = {"landlord": [], "landlord_up": [], "landlord_down": []}
    infoset.played_cards = {"landlord": [], "landlord_up": [], "landlord_down": []}
    infoset.card_play_action_seq = []
    infoset.last_pid = "landlord"
    infoset.bomb_num = int(payload.get("bombCount") or 0)

    last_non_pass = []
    for item in history:
        pos = item.get("position")
        if pos not in infoset.played_cards:
            continue
        action = to_douzero_cards(item.get("values", []))
        infoset.card_play_action_seq.append(action)
        if action:
            infoset.last_pid = pos
            infoset.last_move_dict[pos] = action.copy()
            infoset.played_cards[pos].extend(action)
            last_non_pass = action

    infoset.last_move = last_non_pass
    last_two = infoset.card_play_action_seq[-2:]
    infoset.last_two_moves = ([[], []] + last_two)[-2:]
    infoset.all_handcards = {
        pos: to_douzero_cards(hands[int(index)])
        for index, pos in player_positions.items()
    }
    return infoset


def get_agent(position, model_paths):
    from douzero.evaluation.deep_agent import DeepAgent

    model_path = model_paths.get(position)
    if not model_path:
        raise RuntimeError(f"Missing DouZero model path for {position}")
    if not os.path.exists(model_path):
        raise RuntimeError(f"DouZero model not found: {model_path}")

    cache_key = (position, os.path.abspath(model_path))
    if cache_key not in AGENTS:
        AGENTS[cache_key] = DeepAgent(position, model_path)
    return AGENTS[cache_key]


def choose_action(payload):
    legal_actions = payload.get("legalActions") or []
    if not legal_actions:
        return []

    if len(legal_actions) == 1:
        return [int(value) for value in legal_actions[0]]

    infoset = build_infoset(payload)
    agent = get_agent(payload["position"], payload.get("modelPaths") or {})
    action = agent.act(infoset)
    return [from_douzero_value(value) for value in action]


def respond(message):
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = request.get("id")
            command = request.get("command")

            if command == "status":
                try:
                    import douzero  # noqa: F401
                    respond({"id": request_id, "ok": True, "available": True})
                except Exception as exc:
                    respond({"id": request_id, "ok": True, "available": False, "error": str(exc)})
                continue

            if command != "play":
                respond({"id": request_id, "ok": False, "error": f"Unknown command: {command}"})
                continue

            action = choose_action(request["payload"])
            respond({"id": request_id, "ok": True, "actionValues": action})
        except Exception as exc:
            respond({
                "id": request.get("id") if "request" in locals() else None,
                "ok": False,
                "error": str(exc),
                "traceback": traceback.format_exc(limit=5),
            })


if __name__ == "__main__":
    main()

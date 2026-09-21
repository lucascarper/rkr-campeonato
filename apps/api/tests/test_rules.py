from rules import (
    ScoredResult,
    ScoringConfig,
    apply_discards,
    compute_standings,
    race_points,
    standings_by_event,
)
from rules.stats import build_dashboard

TABLE = {1: 25, 2: 20, 3: 18, 4: 15, 5: 12}
RKR = ScoringConfig(pole_bonus=1, fastest_lap_bonus=2, fastest_lap_min_position=4, shirt_penalty=1)


def result(driver, event, position, points=None, rid=None, **kw):
    return ScoredResult(
        result_id=rid or f"{driver}-{event}-{kw.get('seq', 0)}",
        driver_id=driver,
        event_number=event,
        sequence=event * 100 + kw.pop("seq", 1),
        race_label="Final",
        position=position,
        status=kw.pop("status", "FIN"),
        points=points if points is not None else TABLE.get(position, 0),
        **kw,
    )


class TestRacePoints:
    def test_position_table(self):
        assert race_points(position=1, status="FIN", table=TABLE, config=RKR) == 25
        assert race_points(position=9, status="FIN", table=TABLE, config=RKR) == 0

    def test_pole_bonus_always(self):
        assert race_points(position=1, status="FIN", table=TABLE, config=RKR, pole=True) == 26

    def test_fastest_lap_only_outside_podium(self):
        assert race_points(position=2, status="FIN", table=TABLE, config=RKR, fastest_lap=True) == 20
        assert race_points(position=4, status="FIN", table=TABLE, config=RKR, fastest_lap=True) == 17

    def test_shirt_penalty(self):
        assert race_points(position=5, status="FIN", table=TABLE, config=RKR, shirt_penalty=True) == 11

    def test_dsq_and_dns_get_zero(self):
        for status in ("DSQ", "DNS"):
            assert race_points(position=1, status=status, table=TABLE, config=RKR, pole=True) == 0

    def test_dnf_points(self):
        config = ScoringConfig(dnf_points=3)
        assert race_points(position=2, status="DNF", table=TABLE, config=config) == 3

    def test_defaults_are_zero(self):
        plain = ScoringConfig()
        assert (
            race_points(position=4, status="FIN", table=TABLE, config=plain, pole=True, fastest_lap=True)
            == 15
        )


class TestStandings:
    def test_sum_without_discard(self):
        rows = compute_standings([result("a", 1, 1), result("a", 2, 3), result("b", 1, 2), result("b", 2, 1)])
        assert [(r.driver_id, r.points) for r in rows] == [("b", 45), ("a", 43)]
        assert rows[1].gap_to_leader == 2

    def test_countback_tiebreak(self):
        # Mesmos pontos: "a" tem uma vitória, "b" não.
        rows = compute_standings([result("a", 1, 1, 30), result("b", 1, 2, 20), result("b", 2, 2, 10)])
        assert [r.driver_id for r in rows] == ["a", "b"]

    def test_poles_after_countback(self):
        rows = compute_standings([result("a", 1, 2, 20), result("b", 2, 2, 20, pole=True)])
        assert [r.driver_id for r in rows] == ["b", "a"]
        rows = compute_standings([result("a", 1, 2, 20), result("b", 2, 2, 20)], tiebreak=["countback"])
        assert rows[0].position == rows[1].position == 1

    def test_last_event_tiebreak(self):
        results = [result("a", 1, 1, 10), result("a", 2, 3, 10), result("b", 1, 3, 10), result("b", 2, 1, 10)]
        rows = compute_standings(results, tiebreak=["last_event"])
        assert [r.driver_id for r in rows] == ["b", "a"]

    def test_full_tie_shares_position(self):
        rows = compute_standings([result("a", 1, 5, 2), result("b", 2, 5, 2), result("c", 1, 1, 25)])
        assert [r.position for r in rows] == [1, 2, 2]

    def test_registered_driver_without_results(self):
        rows = compute_standings([result("a", 1, 1)], drivers=["z"])
        assert rows[-1].driver_id == "z" and rows[-1].points == 0

    def test_upto_and_delta(self):
        results = [
            result("a", 1, 1),
            result("b", 1, 2),
            result("b", 2, 1),
            result("b", 3, 1),
            result("a", 3, 5),
        ]
        cuts = standings_by_event(results)
        assert [r.driver_id for r in cuts[1]] == ["a", "b"]
        assert [r.driver_id for r in cuts[3]] == ["b", "a"]
        assert cuts[3][0].delta == 0 and cuts[2][0].delta == 1 and cuts[2][1].delta == -1


class TestDiscards:
    def test_drops_worst(self):
        results = [result("a", 1, 1, rid=1), result("a", 2, 5, rid=2), result("a", 3, 4, rid=3)]
        total, dropped = apply_discards(results, 1)
        assert total == 40 and dropped == {2}

    def test_ties_drop_oldest(self):
        results = [result("a", 1, 9, rid=1), result("a", 2, 9, rid=2), result("a", 3, 1, rid=3)]
        _, dropped = apply_discards(results, 1)
        assert dropped == {1}

    def test_absence_is_not_discarded(self):
        # Só 2 corridas disputadas e 3 descartes: descarta as 2, nunca "ausências".
        results = [result("a", 1, 1, rid=1), result("a", 3, 2, rid=3)]
        total, dropped = apply_discards(results, 3)
        assert total == 0 and dropped == {1, 3}

    def test_dns_is_not_candidate(self):
        results = [
            result("a", 1, None, 0, rid=1, status="DNS"),
            result("a", 2, 5, rid=2),
            result("a", 3, 1, rid=3),
        ]
        _, dropped = apply_discards(results, 1)
        assert dropped == {2}


class TestDashboard:
    def test_consistency_requires_half_of_races(self):
        results = [result("a", n, 1, seq=1) for n in (1, 2, 3, 4)] + [result("b", 1, 2)]
        board = build_dashboard(results, event_numbers=[1, 2, 3, 4], total_races=4)
        ids = [e["driver_id"] for e in board["indicators"]["consistency"]["top"]]
        assert ids == ["a"]

    def test_missing_columns_hide_extras(self):
        board = build_dashboard(
            [result("a", 1, 1)],
            event_numbers=[1],
            total_races=1,
            availability={"start_position": False, "best_lap": False},
        )
        assert board["extras"]["avg_gain"] is None and board["extras"]["best_lap"] is None

    def test_penalties_total(self):
        results = [result("a", 1, 3, penalties=2, penalty_seconds=20), result("b", 1, 1, penalties=1)]
        board = build_dashboard(results, event_numbers=[1], total_races=1)
        pen = board["indicators"]["penalties"]
        assert pen["total"] == 3 and pen["total_seconds"] == 20 and pen["top"][0]["driver_id"] == "a"

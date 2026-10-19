package feed

import "time"

func nthSunday(year int, month time.Month, n int) time.Time {
	first := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	offset := (7 - int(first.Weekday())) % 7
	return time.Date(year, month, 1+offset+7*(n-1), 0, 0, 0, 0, time.UTC)
}

func usOffset(now time.Time) time.Duration {
	y := now.UTC().Year()
	start := nthSunday(y, time.March, 2).Add(7 * time.Hour)
	end := nthSunday(y, time.November, 1).Add(6 * time.Hour)
	if now.UTC().After(start) && now.UTC().Before(end) {
		return -4 * time.Hour
	}
	return -5 * time.Hour
}

func marketOpen(assetClass, quoteCurrency string, now time.Time) bool {
	switch assetClass {
	case "CRYPTO":
		return true
	case "FOREX", "COMMODITY":
		wd := now.UTC().Weekday()
		return wd != time.Saturday && wd != time.Sunday
	case "INDEX", "STOCK":
		indian := quoteCurrency == "INR"
		var offset time.Duration
		var openMin, closeMin int
		if indian {
			offset = 330 * time.Minute
			openMin, closeMin = 9*60+15, 15*60+30
		} else {
			offset = usOffset(now)
			openMin, closeMin = 9*60+30, 16*60
		}
		d := now.UTC().Add(offset)
		wd := d.Weekday()
		if wd == time.Saturday || wd == time.Sunday {
			return false
		}
		m := d.Hour()*60 + d.Minute()
		return m >= openMin && m <= closeMin
	default:
		return true
	}
}

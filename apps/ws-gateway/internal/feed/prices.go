package feed

func pricePlaces(symbol string) int {
	switch symbol {
	case "USDJPY":
		return 3
	case "XAUUSD":
		return 2
	case "XAGUSD":
		return 3
	case "USOIL":
		return 2
	case "US500", "NAS100":
		return 1
	default:
		if len(symbol) == 6 {
			return 5
		}
		return 2
	}
}

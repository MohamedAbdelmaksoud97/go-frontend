export type GateDirection = "IN" | "OUT" | "UNKNOWN"

/**
 * The main branch has one physical gate. Its ACP-260 wiring reports the
 * entrance reader on controller port 2 and the exit reader on port 1.
 * Prefer the verified physical wiring over the SDK direction flag so both
 * current events and historical events are presented consistently.
 */
export function physicalGateDirection(doorNumber:number,direction:GateDirection):GateDirection{
  if(doorNumber===2)return "IN"
  if(doorNumber===1)return "OUT"
  return direction
}

import type { Status } from '@apto/regras';
import { ROTULO_STATUS } from '../textos';
import { IconeStatus } from './Icones';

export function SeloStatus({ status }: { status: Status }) {
  return (
    <span className={`selo s-${status}`}>
      <IconeStatus status={status} />
      {ROTULO_STATUS[status]}
    </span>
  );
}

import {
  AppendRunEventDto,
  CreateRunDto,
  RunEventEnvelopeDto,
  RunQueryDto,
  UpdateRunDto,
} from '@api/collections/runs/dto/create-run.dto';

describe('Run DTOs', () => {
  it('should define CreateRunDto', () => {
    expect(CreateRunDto).toBeDefined();
    expect(new CreateRunDto()).toBeInstanceOf(CreateRunDto);
  });

  it('should define UpdateRunDto', () => {
    expect(UpdateRunDto).toBeDefined();
    expect(new UpdateRunDto()).toBeInstanceOf(UpdateRunDto);
  });

  it('should define AppendRunEventDto', () => {
    expect(AppendRunEventDto).toBeDefined();
    expect(new AppendRunEventDto()).toBeInstanceOf(AppendRunEventDto);
  });

  it('should define RunQueryDto', () => {
    expect(RunQueryDto).toBeDefined();
    expect(new RunQueryDto()).toBeInstanceOf(RunQueryDto);
  });

  it('should define RunEventEnvelopeDto', () => {
    expect(RunEventEnvelopeDto).toBeDefined();
    expect(new RunEventEnvelopeDto()).toBeInstanceOf(RunEventEnvelopeDto);
  });
});

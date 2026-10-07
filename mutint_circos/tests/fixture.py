"""One experiment imported as breseq folders, with every kind of mark the plot draws.

A 20 kb contig of A's (so a 6 kb deletion fits), and samples named by their coordinate so
each lands at a population and a time point. `SAMPLES` is `{name: [mutation lines]}`, as the
recurrent fixture spells them.
"""

import shutil
import tempfile

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from mutint_experiment.models import Experiment
from mutint_import import breseq_folder
from mutint_import.tests import breseq_fixture

SEQ_ID = "test_ref"
LENGTH = 20000
SEQUENCE = "A" * LENGTH

HEADER = "#=GENOME_DIFF\t1.0\n#=REFSEQ\t%s\n" % SEQ_ID


def gd(*lines):
    """A .gd of the given mutation lines, numbered in order."""
    out = [HEADER.rstrip("\n")]
    for number, line in enumerate(lines, 1):
        out.append("%s\t%d\t." % (line[0], number) + "\t" + "\t".join(str(x) for x in line[1:]))
    return "\n".join(out) + "\n"


SNP = ("SNP", SEQ_ID, 100, "G", "frequency=1")
MIXED_SNP = ("SNP", SEQ_ID, 150, "T", "frequency=0.42")
SMALL_DEL = ("DEL", SEQ_ID, 200, 2, "frequency=1")
BIG_DEL = ("DEL", SEQ_ID, 1000, 6000, "frequency=1")
AMP = ("AMP", SEQ_ID, 300, 10, 2, "frequency=1")
MOB = ("MOB", SEQ_ID, 400, "IS1", 1, 9, "frequency=1")

#: Population 1 at 100 (two samples) and 500, population 2 at 100.
SAMPLES = {
    "1-100-1-1": [SNP, SMALL_DEL],
    "1-100-2-1": [SNP, BIG_DEL, MOB],
    "1-500-1-1": [SNP, BIG_DEL, AMP, MIXED_SNP],
    "2-100-1-1": [SNP],
}


class CircosFixture(TestCase):
    SAMPLES = SAMPLES

    def setUp(self):
        self.user = User.objects.create(username="tester", email="t@e.com",
                                        is_active=True, is_staff=True)
        self.client.force_login(self.user)
        self.drop = tempfile.mkdtemp()
        self.store = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.drop, True)
        self.addCleanup(shutil.rmtree, self.store, True)
        patcher = override_settings(MUTINT_STORE_DIR=self.store)
        patcher.enable()
        self.addCleanup(patcher.disable)
        from mutint_import import annotation
        annotation.clear_cache()
        self.addCleanup(annotation.clear_cache)
        for name, lines in self.SAMPLES.items():
            breseq_fixture.write_sample(self.drop, name, sequences=[(SEQ_ID, SEQUENCE)],
                                        gd_text=gd(*lines))
        breseq_folder.import_breseq_folders(
            self.drop, project_name="P", experiment_name="E", owner_name="tester")
        self.experiment = Experiment.objects.get()

    def sample(self, source_name):
        from mutint_sample.models import Sample
        return Sample.objects.get(source_name=source_name)
